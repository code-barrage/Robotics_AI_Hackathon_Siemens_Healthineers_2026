package com.pudutech.peanut.tp.camera;

import android.os.ParcelFileDescriptor;

// Reconstructed from "PUDU-Siemens Secondary Development Guide" 3.2 (shared by face and Mark cameras).
// Delete src/main/aidl once the official lib_tp_aidl AAR is added, or the classes will be duplicated.
interface ITpCameraMarkerFrameCallback {
    void onFrame(in ParcelFileDescriptor fd, int rows, int cols, int memorySize, int elementSize, long time);
}
