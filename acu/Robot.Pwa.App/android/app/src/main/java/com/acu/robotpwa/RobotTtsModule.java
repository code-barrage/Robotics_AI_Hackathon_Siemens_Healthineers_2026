package com.acu.robotpwa;

import android.content.Intent;
import android.media.AudioAttributes;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.module.annotations.ReactModule;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;

/**
 Speaks TTS text through Android’s speech engine. Also checks available languages, stops speech and opens voice-data installation.
 */
@ReactModule(name = RobotTtsModule.NAME)
public class RobotTtsModule extends ReactContextBaseJavaModule {

    public static final String NAME = "RobotTts";

    private final Object lock = new Object();
    private TextToSpeech tts;
    /** null = initialising, true = ready, false = init failed. */
    private Boolean ready = null;
    private final List<Waiter> pending = new ArrayList<>();

    public RobotTtsModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @NonNull
    @Override
    public String getName() {
        return NAME;
    }

    private static final class Waiter {
        final Runnable onReady;
        final Promise promise;
        Waiter(Runnable onReady, Promise promise) { this.onReady = onReady; this.promise = promise; }
    }

    private static void rejectInit(Promise promise) {
        promise.reject("TTS_INIT_FAILED", "Android TextToSpeech engine failed to initialise. Is a TTS engine installed?");
    }

    /**
     * Runs {@code onReady} once the engine is initialised (immediately if it already is).
     * A failed init is retried on the next call, so installing an engine later works without a restart.
     */
    private void whenReady(Runnable onReady, Promise promise) {
        boolean runNow;
        synchronized (lock) {
            runNow = Boolean.TRUE.equals(ready);
            if (!runNow) {
                pending.add(new Waiter(onReady, promise));
                if (tts == null) {
                    ready = null;
                    tts = new TextToSpeech(getReactApplicationContext(), this::onInit);
                }
            }
        }
        if (runNow) onReady.run();
    }

    private void onInit(int status) {
        List<Waiter> queued;
        boolean ok = status == TextToSpeech.SUCCESS;
        synchronized (lock) {
            ready = ok;
            queued = new ArrayList<>(pending);
            pending.clear();
            if (!ok && tts != null) { tts.shutdown(); tts = null; }
        }
        for (Waiter w : queued) {
            if (ok) w.onReady.run();
            else rejectInit(w.promise);
        }
    }

    private TextToSpeech engine() {
        synchronized (lock) { return tts; }
    }

    private static String statusName(int result) {
        switch (result) {
            case TextToSpeech.LANG_AVAILABLE:
            case TextToSpeech.LANG_COUNTRY_AVAILABLE:
            case TextToSpeech.LANG_COUNTRY_VAR_AVAILABLE:
                return "available";
            case TextToSpeech.LANG_MISSING_DATA:
                return "missing_data";
            default:
                return "not_supported";
        }
    }

    @ReactMethod
    public void speak(String text, String languageTag, double volume, double pitch, double rate, Promise promise) {
        if (text == null || text.trim().isEmpty()) { promise.resolve(null); return; }
        if (!Double.isFinite(volume) || (volume != -1 && (volume < 0 || volume > 1))
                || !Double.isFinite(pitch) || pitch < 0.5 || pitch > 2
                || !Double.isFinite(rate) || rate < 0.5 || rate > 2) {
            promise.reject("TTS_SETTINGS_INVALID", "Invalid speech volume, pitch or speed.");
            return;
        }
        whenReady(() -> {
            TextToSpeech engine = engine();
            if (engine == null) { rejectInit(promise); return; }
            Locale locale = Locale.forLanguageTag(languageTag == null ? "" : languageTag);
            int result = engine.setLanguage(locale);
            if (result == TextToSpeech.LANG_MISSING_DATA) {
                promise.reject("LANG_MISSING_DATA", "Voice data for " + languageTag + " is not installed on this robot.");
                return;
            }
            if (result == TextToSpeech.LANG_NOT_SUPPORTED) {
                promise.reject("LANG_NOT_SUPPORTED", "The robot's TTS engine does not support " + languageTag + ".");
                return;
            }
            AudioAttributes attributes = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build();
            if (engine.setAudioAttributes(attributes) != TextToSpeech.SUCCESS
                    || engine.setPitch((float) pitch) != TextToSpeech.SUCCESS
                    || engine.setSpeechRate((float) rate) != TextToSpeech.SUCCESS) {
                promise.reject("TTS_SETTINGS_FAILED", "The TTS engine could not apply speech settings.");
                return;
            }
            Bundle params = new Bundle();
            params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, volume < 0 ? 1f : (float) volume);
            int queued = engine.speak(text, TextToSpeech.QUEUE_FLUSH, params, UUID.randomUUID().toString());
            if (queued == TextToSpeech.SUCCESS) promise.resolve(null);
            else promise.reject("TTS_SPEAK_FAILED", "TextToSpeech.speak returned an error.");
        }, promise);
    }

    @ReactMethod
    public void stop(Promise promise) {
        synchronized (lock) {
            if (tts != null && Boolean.TRUE.equals(ready)) tts.stop();
        }
        promise.resolve(null);
    }

    /** Engine name, status of {@code languageTag} and every language the engine can voice. */
    @ReactMethod
    public void getInfo(String languageTag, Promise promise) {
        whenReady(() -> {
            TextToSpeech tts = engine();
            if (tts == null) { rejectInit(promise); return; }
            WritableMap info = Arguments.createMap();
            String engine = tts.getDefaultEngine();
            info.putString("engine", engine);
            String label = engine;
            for (TextToSpeech.EngineInfo e : tts.getEngines()) {
                if (e.name.equals(engine)) { label = e.label; break; }
            }
            info.putString("engineLabel", label);
            info.putString("languageTag", languageTag);
            info.putString("status", statusName(tts.isLanguageAvailable(Locale.forLanguageTag(languageTag == null ? "" : languageTag))));

            Set<String> tags = new TreeSet<>();
            try {
                Set<Locale> locales = tts.getAvailableLanguages();
                if (locales != null) for (Locale l : locales) tags.add(l.toLanguageTag());
            } catch (Exception ignored) {
                // Some engines throw here; fall back to installed voices below.
            }
            try {
                Set<Voice> voices = tts.getVoices();
                if (voices != null) for (Voice v : voices) {
                    if (!v.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED))
                        tags.add(v.getLocale().toLanguageTag());
                }
            } catch (Exception ignored) {
                // getVoices() is optional for engines.
            }
            WritableArray list = Arguments.createArray();
            for (String t : tags) list.pushString(t);
            info.putArray("availableLanguages", list);
            promise.resolve(info);
        }, promise);
    }

    /** Opens the engine's "install voice data" screen so missing languages can be added on-robot. */
    @ReactMethod
    public void openInstallVoiceData(Promise promise) {
        try {
            Intent intent = new Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getReactApplicationContext().startActivity(intent);
            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("INSTALL_INTENT_FAILED", "No TTS engine handles voice-data installation: " + e.getMessage(), e);
        }
    }

    @Override
    public void invalidate() {
        synchronized (lock) {
            if (tts != null) { tts.stop(); tts.shutdown(); tts = null; }
            ready = null;
            pending.clear();
        }
        super.invalidate();
    }
}
