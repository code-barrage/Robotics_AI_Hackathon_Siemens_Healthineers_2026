package com.acu.robotpwa;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.graphics.Bitmap;
import android.os.IBinder;
import android.os.ParcelFileDescriptor;
import android.util.Base64;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.pudutech.peanut.tp.camera.ITpCameraMarkerFrameCallback;
import com.pudutech.peanut.tp.camera.ITpCameraPalletFrameCallback;
import com.pudutech.peanut.tp.ITpRobotGatewayService;

import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.ByteBuffer;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.nio.channels.FileChannel;

/**
 * Bridges the Pudu robot host's TpRobotGatewayAidlService to React Native. JS API: src/lib/puduCamera.ts.
 * Connects to Pudu’s camera gateway service. Receives face/marker/tray camera frames and passes previews and diagnostic events to the app.
 */
public class PuduCameraModule extends ReactContextBaseJavaModule {

    private static final String ROBOT_PACKAGE = "com.pudutech.robot.peanut";
    private static final String GATEWAY_SERVICE_CLASS =
        "com.pudutech.peanut.robot_ui.thirdparty.TpRobotGatewayAidlService";
    private static final String LISTENER_NAME = "acu-robot-pwa";
    private static final long PREVIEW_INTERVAL_MS = 250;

    private final ReactApplicationContext context;
    private volatile ITpRobotGatewayService gateway;
    private boolean bound = false;
    private boolean faceStarted = false;
    private boolean markStopped = false;
    private Promise pendingBind;
    private final long[] lastPreview = new long[4];
    private final java.util.Set<String> seen = java.util.Collections.synchronizedSet(new java.util.HashSet<String>());

    private final ExecutorService uploader = Executors.newFixedThreadPool(2);
    private final AtomicBoolean[] uploadBusy = {
        new AtomicBoolean(), new AtomicBoolean(), new AtomicBoolean(), new AtomicBoolean() };
    private final long[] lastUpload = new long[4];
    private final AtomicLong uploadSent = new AtomicLong();
    private final AtomicLong uploadFailed = new AtomicLong();
    private volatile String uploadBase;
    private volatile String uploadRobot;
    private volatile long uploadIntervalMs = 500;
    private volatile boolean uploadMark;
    private volatile long lastUploadOk;
    private volatile String uploadError;

    public PuduCameraModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.context = reactContext;
    }

    @NonNull
    @Override
    public String getName() {
        return "PuduCamera";
    }

    private final ServiceConnection connection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder service) {
            ITpRobotGatewayService g = ITpRobotGatewayService.Stub.asInterface(service);
            if (g == null) {
                resolveBind(false, "Gateway returned a null interface");
                return;
            }
            try {
                g.addMonoCameraListener(LISTENER_NAME, faceCallback);
                emitLog("addMonoCameraListener OK");
                g.addMarkCameraListener(LISTENER_NAME, markCallback);
                emitLog("addMarkCameraListener OK");
                g.addPalletCameraListener(LISTENER_NAME, palletCallback);
                emitLog("addPalletCameraListener OK");
                gateway = g;
                emitGateway(true);
                resolveBind(true, null);
            } catch (Exception e) {
                emitLog("Listener registration failed: " + e);
                resolveBind(false, "Could not register camera listeners: " + e.getMessage());
            }
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            gateway = null;
            emitLog("Service disconnected by the robot app");
            emitGateway(false);
        }
    };

    private void resolveBind(boolean ok, String error) {
        Promise p = pendingBind;
        pendingBind = null;
        if (p == null) return;
        if (ok) p.resolve(true);
        else p.reject("BIND_FAILED", error);
    }

    @ReactMethod
    public synchronized void bind(Promise promise) {
        if (gateway != null) {
            promise.resolve(true);
            return;
        }
        try {
            // Explicit component only: action + setPackage returns false on most models.
            Intent intent = new Intent().setComponent(new ComponentName(ROBOT_PACKAGE, GATEWAY_SERVICE_CLASS));
            pendingBind = promise;
            bound = context.bindService(intent, connection, Context.BIND_AUTO_CREATE);
            if (!bound) {
                pendingBind = null;
                promise.resolve(false);
            }
        } catch (Exception e) {
            pendingBind = null;
            promise.reject("BIND_FAILED", e.getMessage(), e);
        }
    }

    /** Release order from the guide: stop face, restore Mark, remove listeners, drop proxy, unbind. */
    @ReactMethod
    public synchronized void unbind(Promise promise) {
        ITpRobotGatewayService g = gateway;
        if (g != null) {
            try { if (faceStarted) g.stopMonocularCamera(); } catch (Exception ignored) { }
            try { if (markStopped) g.runMarkerCamera(); } catch (Exception ignored) { }
            try { g.removeMonoCameraListener(LISTENER_NAME); } catch (Exception ignored) { }
            try { g.removeMarkCameraListener(LISTENER_NAME); } catch (Exception ignored) { }
            try { g.removePalletCameraListener(LISTENER_NAME); } catch (Exception ignored) { }
        }
        faceStarted = false;
        markStopped = false;
        gateway = null;
        seen.clear();
        if (bound) {
            try { context.unbindService(connection); } catch (Exception ignored) { }
            bound = false;
        }
        emitGateway(false);
        promise.resolve(null);
    }

    @ReactMethod
    public synchronized void startCamera(String camera, Promise promise) {
        ITpRobotGatewayService g = gateway;
        if (g == null) { promise.reject("NOT_BOUND", "Gateway is not connected"); return; }
        try {
            if ("face".equals(camera)) { g.runMonocularCamera(); faceStarted = true; }
            else if ("mark".equals(camera)) { g.runMarkerCamera(); markStopped = false; }
            else if (!"tray".equals(camera)) { promise.reject("BAD_CAMERA", "Unknown camera " + camera); return; }
            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("START_FAILED", e.getMessage(), e);
        }
    }

    @ReactMethod
    public synchronized void stopCamera(String camera, Promise promise) {
        ITpRobotGatewayService g = gateway;
        if (g == null) { promise.reject("NOT_BOUND", "Gateway is not connected"); return; }
        try {
            if ("face".equals(camera)) { g.stopMonocularCamera(); faceStarted = false; }
            else if ("mark".equals(camera)) { g.stopMarkerCamera(); markStopped = true; }
            else { promise.reject("BAD_CAMERA", "The tray camera has no switch"); return; }
            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("STOP_FAILED", e.getMessage(), e);
        }
    }

    /** Removes and re-adds only the tray listener, to test whether the robot starts sending tray frames. */
    @ReactMethod
    public synchronized void reRegisterTray(Promise promise) {
        ITpRobotGatewayService g = gateway;
        if (g == null) { promise.reject("NOT_BOUND", "Gateway is not connected"); return; }
        try {
            g.removePalletCameraListener(LISTENER_NAME);
            seen.remove("tray layer 0"); seen.remove("tray layer 1");
            g.addPalletCameraListener(LISTENER_NAME, palletCallback);
            emitLog("Tray listener re-registered");
            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("TRAY_FAILED", e.getMessage(), e);
        }
    }

    /** Never leave the robot with a stopped Mark camera or our listeners attached if the app reloads or closes. */
    @Override
    public void invalidate() {
        ITpRobotGatewayService g = gateway;
        if (g != null) {
            try { if (faceStarted) g.stopMonocularCamera(); } catch (Exception ignored) { }
            try { if (markStopped) g.runMarkerCamera(); } catch (Exception ignored) { }
            try { g.removeMonoCameraListener(LISTENER_NAME); } catch (Exception ignored) { }
            try { g.removeMarkCameraListener(LISTENER_NAME); } catch (Exception ignored) { }
            try { g.removePalletCameraListener(LISTENER_NAME); } catch (Exception ignored) { }
        }
        gateway = null;
        uploadBase = null;
        uploader.shutdownNow();
        if (bound) { try { context.unbindService(connection); } catch (Exception ignored) { } bound = false; }
        super.invalidate();
    }

    @ReactMethod
    public void addListener(String eventName) { }

    @ReactMethod
    public void removeListeners(double count) { }

    private final ITpCameraMarkerFrameCallback.Stub faceCallback = new ITpCameraMarkerFrameCallback.Stub() {
        @Override
        public void onFrame(ParcelFileDescriptor fd, int rows, int cols, int memorySize, int elementSize, long time) {
            handleFrame("face", 0, -1, fd, rows, cols, memorySize, elementSize, time);
        }
    };

    private final ITpCameraMarkerFrameCallback.Stub markCallback = new ITpCameraMarkerFrameCallback.Stub() {
        @Override
        public void onFrame(ParcelFileDescriptor fd, int rows, int cols, int memorySize, int elementSize, long time) {
            handleFrame("mark", 1, -1, fd, rows, cols, memorySize, elementSize, time);
        }
    };

    private final ITpCameraPalletFrameCallback.Stub palletCallback = new ITpCameraPalletFrameCallback.Stub() {
        @Override
        public void onFrame(int location, ParcelFileDescriptor fd, int rows, int cols, int memorySize, int elementSize, long scanTime) {
            handleFrame("tray", 2, location, fd, rows, cols, memorySize, elementSize, scanTime);
        }
    };

    /** Runs on a Binder thread. The fd is always closed, otherwise the host app leaks descriptors. */
    private void handleFrame(String camera, int slot, int location, ParcelFileDescriptor fd,
                             int rows, int cols, int memorySize, int elementSize, long time) {
        String key = location >= 0 ? camera + " layer " + location : camera;
        if (location >= 0) slot = slot + Math.min(location, 1);
        try {
            if (seen.add(key)) {
                emitLog("First " + key + " frame: " + cols + "x" + rows + ", memorySize=" + memorySize
                    + ", elementSize=" + elementSize + ", fd=" + (fd != null));
            }
            WritableMap map = Arguments.createMap();
            map.putString("camera", camera);
            map.putInt("width", cols);
            map.putInt("height", rows);
            map.putDouble("timestamp", (double) time);
            if (location >= 0) map.putInt("location", location);

            long now = System.currentTimeMillis();
            boolean preview = now - lastPreview[slot] >= PREVIEW_INTERVAL_MS;
            boolean upload = wantsUpload(camera, slot, now);
            if (fd != null && (preview || upload)) {
                double[][] raw = upload && "tray".equals(camera) ? new double[1][] : null;
                byte[] jpeg = toJpeg(key, fd, rows, cols, memorySize, elementSize, raw);
                if (jpeg != null) {
                    if (preview) {
                        lastPreview[slot] = now;
                        map.putString("jpeg", Base64.encodeToString(jpeg, Base64.NO_WRAP));
                    }
                    String depth = raw != null && raw[0] != null ? depthJson(raw[0], rows, cols, location, time) : null;
                    if (upload) enqueueUpload(camera, slot, location, jpeg, depth, now);
                }
            }
            emit("PuduCameraFrame", map);
        } catch (Throwable e) {
            emitLog("Frame handling error (" + key + "): " + e);
        } finally {
            if (fd != null) {
                try { fd.close(); } catch (IOException ignored) { }
            }
        }
    }

    /**
     * Decodes a frame for preview. elementSize is bytes per value: 1 = grey, 2 = 16-bit, 3 = RGB,
     * 4 = float32/int32 for the tray camera and RGBA for the others. Single-channel data is
     * stretched between its min and max so depth-like tray data is visible. When rawOut is given,
     * the decoded single-channel values are handed back in rawOut[0] (row-major).
     */
    private byte[] toJpeg(String key, ParcelFileDescriptor pfd, int rows, int cols, int memorySize, int elementSize,
                          double[][] rawOut) {
        if (rows <= 0 || cols <= 0 || elementSize < 1 || elementSize > 4) {
            logOnce(key + ":layout", "No preview for " + key + ": unsupported layout " + cols + "x" + rows + ", elementSize=" + elementSize);
            return null;
        }
        int pixels = rows * cols;
        int needed = pixels * elementSize;
        if (memorySize < needed) {
            logOnce(key + ":size", "No preview for " + key + ": memorySize " + memorySize + " < " + needed + " needed");
            return null;
        }

        byte[] data = readFully(pfd, needed);
        if (data == null) {
            logOnce(key + ":read", "No preview for " + key + ": could not read the frame data");
            return null;
        }

        int[] argb = new int[pixels];
        boolean tray = key.startsWith("tray");
        if (elementSize == 3 || (elementSize == 4 && !tray)) {
            for (int i = 0; i < pixels; i++) {
                int o = i * elementSize;
                argb[i] = 0xFF000000 | ((data[o] & 0xFF) << 16) | ((data[o + 1] & 0xFF) << 8) | (data[o + 2] & 0xFF);
            }
        } else {
            ByteBuffer bb = ByteBuffer.wrap(data).order(java.nio.ByteOrder.LITTLE_ENDIAN);
            double[] v = new double[pixels];
            int nonFinite = 0;
            for (int i = 0; i < pixels; i++) {
                if (elementSize == 1) v[i] = data[i] & 0xFF;
                else if (elementSize == 2) v[i] = bb.getShort(i * 2) & 0xFFFF;
                else {
                    float f = bb.getFloat(i * 4);
                    if (Float.isNaN(f) || Float.isInfinite(f)) nonFinite++;
                    v[i] = f;
                }
            }
            if (elementSize == 4 && nonFinite > pixels / 10) {
                for (int i = 0; i < pixels; i++) v[i] = bb.getInt(i * 4);
            }
            if (rawOut != null) rawOut[0] = v;
            double min = Double.MAX_VALUE, max = -Double.MAX_VALUE;
            for (double d : v) {
                if (Double.isNaN(d) || Double.isInfinite(d)) continue;
                if (d < min) min = d;
                if (d > max) max = d;
            }
            if (min > max) { min = 0; max = 1; }
            logOnce(key + ":range", key + " values: min=" + min + ", max=" + max + ", elementSize=" + elementSize);
            double span = Math.max(max - min, 1e-9);
            for (int i = 0; i < pixels; i++) {
                double d = v[i];
                int g = (Double.isNaN(d) || Double.isInfinite(d)) ? 0 : (int) (((d - min) / span) * 255.0);
                argb[i] = 0xFF000000 | (g << 16) | (g << 8) | g;
            }
        }
        Bitmap bmp = Bitmap.createBitmap(argb, cols, rows, Bitmap.Config.ARGB_8888);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        bmp.compress(Bitmap.CompressFormat.JPEG, 60, out);
        bmp.recycle();
        return out.toByteArray();
    }

    // ---- Live upload to the ACU (POST /api/camera/frames, raw JPEG body) ----

    /**
     * Starts streaming frames straight from native code, bypassing the JS bridge.
     * At most one upload per camera slot is in flight; frames arriving meanwhile are dropped.
     */
    @ReactMethod
    public void startUpload(String acuUrl, String robotId, double intervalMs, boolean includeMark, Promise promise) {
        String base = acuUrl == null ? "" : acuUrl.trim().replaceAll("/+$", "");
        if (base.isEmpty() || robotId == null || robotId.trim().isEmpty()) {
            promise.reject("BAD_ARGS", "acuUrl and robotId are required");
            return;
        }
        uploadBase = base;
        uploadRobot = robotId.trim();
        uploadIntervalMs = Math.max(100L, (long) intervalMs);
        uploadMark = includeMark;
        uploadError = null;
        emitLog("Camera upload started: " + base + " every " + uploadIntervalMs + " ms");
        promise.resolve(null);
    }

    @ReactMethod
    public void stopUpload(Promise promise) {
        if (uploadBase != null) emitLog("Camera upload stopped");
        uploadBase = null;
        promise.resolve(null);
    }

    @ReactMethod
    public void getUploadStats(Promise promise) {
        WritableMap map = Arguments.createMap();
        map.putBoolean("active", uploadBase != null);
        map.putDouble("sent", uploadSent.get());
        map.putDouble("failed", uploadFailed.get());
        map.putDouble("intervalMs", uploadIntervalMs);
        if (lastUploadOk > 0) map.putDouble("lastSentAt", lastUploadOk);
        if (uploadError != null) map.putString("lastError", uploadError);
        promise.resolve(map);
    }

    private boolean wantsUpload(String camera, int slot, long now) {
        if (uploadBase == null) return false;
        if ("mark".equals(camera) && !uploadMark) return false;
        return !uploadBusy[slot].get() && now - lastUpload[slot] >= uploadIntervalMs;
    }

    private void enqueueUpload(String camera, int slot, int location, byte[] jpeg, String sensorJson, long now) {
        final String base = uploadBase, robot = uploadRobot;
        if (base == null || !uploadBusy[slot].compareAndSet(false, true)) return;
        lastUpload[slot] = now;
        try {
            uploader.execute(() -> {
                try {
                    postFrame(base, robot, camera, location, jpeg);
                    if (sensorJson != null) postSensor(base, robot, "tray-depth-" + Math.max(location, 0), sensorJson);
                } finally {
                    uploadBusy[slot].set(false);
                }
            });
        } catch (Exception e) {
            uploadBusy[slot].set(false);
        }
    }

    private void postFrame(String base, String robot, String camera, int location, byte[] jpeg) {
        HttpURLConnection c = null;
        try {
            String q = "camera=" + URLEncoder.encode(camera, "UTF-8") + "&robotId=" + URLEncoder.encode(robot, "UTF-8")
                + (location >= 0 ? "&location=" + location : "");
            c = (HttpURLConnection) new URL(base + "/api/camera/frames?" + q).openConnection();
            c.setRequestMethod("POST");
            c.setConnectTimeout(3000);
            c.setReadTimeout(5000);
            c.setDoOutput(true);
            c.setFixedLengthStreamingMode(jpeg.length);
            c.setRequestProperty("Content-Type", "image/jpeg");
            try (OutputStream out = c.getOutputStream()) { out.write(jpeg); }
            int code = c.getResponseCode();
            if (code >= 200 && code < 300) {
                uploadSent.incrementAndGet();
                lastUploadOk = System.currentTimeMillis();
            } else {
                uploadFailed.incrementAndGet();
                reportUploadError("HTTP " + code + " from " + base);
            }
        } catch (Exception e) {
            uploadFailed.incrementAndGet();
            reportUploadError(e.getClass().getSimpleName() + ": " + e.getMessage());
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private static final int DEPTH_MAX_COLS = 48;

    /**
     * Raw tray-camera values, block-averaged down to at most DEPTH_MAX_COLS columns (non-finite
     * values ignored, null when a block has none). Units are whatever the Pudu SDK delivers.
     */
    private static String depthJson(double[] v, int rows, int cols, int location, long time) {
        int step = Math.max(1, (int) Math.ceil(cols / (double) DEPTH_MAX_COLS));
        int outCols = (cols + step - 1) / step, outRows = (rows + step - 1) / step;
        double min = Double.MAX_VALUE, max = -Double.MAX_VALUE;
        StringBuilder sb = new StringBuilder(outCols * outRows * 7 + 200);
        sb.append("{\"camera\":\"tray\",\"location\":").append(location)
          .append(",\"timestamp\":").append(time)
          .append(",\"srcCols\":").append(cols).append(",\"srcRows\":").append(rows)
          .append(",\"cols\":").append(outCols).append(",\"rows\":").append(outRows)
          .append(",\"step\":").append(step).append(",\"values\":[");
        for (int by = 0; by < outRows; by++) {
            for (int bx = 0; bx < outCols; bx++) {
                double sum = 0; int n = 0;
                for (int y = by * step; y < Math.min(rows, (by + 1) * step); y++)
                    for (int x = bx * step; x < Math.min(cols, (bx + 1) * step); x++) {
                        double d = v[y * cols + x];
                        if (Double.isNaN(d) || Double.isInfinite(d)) continue;
                        sum += d; n++;
                    }
                if (by + bx > 0) sb.append(',');
                if (n == 0) { sb.append("null"); continue; }
                double avg = sum / n;
                if (avg < min) min = avg;
                if (avg > max) max = avg;
                sb.append(String.format(java.util.Locale.ROOT, "%.4g", avg));
            }
        }
        sb.append("]");
        if (min <= max) sb.append(",\"min\":").append(min).append(",\"max\":").append(max);
        return sb.append('}').toString();
    }

    private void postSensor(String base, String robot, String kind, String json) {
        HttpURLConnection c = null;
        try {
            byte[] body = json.getBytes("UTF-8");
            c = (HttpURLConnection) new URL(base + "/api/bot/" + URLEncoder.encode(robot, "UTF-8").replace("+", "%20")
                + "/sensors/" + kind).openConnection();
            c.setRequestMethod("POST");
            c.setConnectTimeout(3000);
            c.setReadTimeout(5000);
            c.setDoOutput(true);
            c.setFixedLengthStreamingMode(body.length);
            c.setRequestProperty("Content-Type", "application/json");
            try (OutputStream out = c.getOutputStream()) { out.write(body); }
            int code = c.getResponseCode();
            if (code < 200 || code >= 300) logOnce("sensor:" + code, "Sensor upload " + kind + ": HTTP " + code);
        } catch (Exception e) {
            logOnce("sensor:" + e.getClass().getSimpleName(), "Sensor upload " + kind + " failed: " + e);
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private void reportUploadError(String message) {
        boolean changed = !message.equals(uploadError);
        uploadError = message;
        if (changed) emitLog("Camera upload error: " + message);
    }

    private void logOnce(String id, String message) {
        if (seen.add(id)) emitLog(message);
    }

    /** Reads without closing the stream: closing it would close the descriptor that handleFrame closes afterwards. */
    private byte[] readFully(ParcelFileDescriptor pfd, int size) {
        try {
            FileInputStream in = new FileInputStream(pfd.getFileDescriptor());
            byte[] buf = new byte[size];
            int read = 0;
            while (read < size) {
                int n = in.read(buf, read, size - read);
                if (n < 0) break;
                read += n;
            }
            if (read == size) return buf;
        } catch (IOException ignored) {
        }
        // Shared-memory descriptors can't always be read as a stream; map them instead.
        try {
            FileInputStream in = new FileInputStream(pfd.getFileDescriptor());
            ByteBuffer map = in.getChannel().map(FileChannel.MapMode.READ_ONLY, 0, size);
            byte[] buf = new byte[size];
            map.get(buf);
            return buf;
        } catch (Exception e) {
            return null;
        }
    }

    private void emitLog(String message) {
        WritableMap map = Arguments.createMap();
        map.putString("message", message);
        emit("PuduCameraLog", map);
    }

    private void emitGateway(boolean isBound) {
        WritableMap map = Arguments.createMap();
        map.putBoolean("bound", isBound);
        emit("PuduCameraGateway", map);
    }

    private void emit(String event, WritableMap payload) {
        if (!context.hasActiveReactInstance()) return;
        context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class).emit(event, payload);
    }
}
