package com.pudutech.peanut.tp.camera;

import android.os.ParcelFileDescriptor;

// Reconstructed from the guide, section 3.3 (tray camera).
interface ITpCameraPalletFrameCallback {
    void onFrame(int location, in ParcelFileDescriptor fd, int rows, int cols, int memorySize, int elementSize, long scan_time_stamp);
}
