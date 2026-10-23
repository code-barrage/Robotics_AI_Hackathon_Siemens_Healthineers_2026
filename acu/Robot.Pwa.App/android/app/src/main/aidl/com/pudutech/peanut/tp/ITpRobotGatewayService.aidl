package com.pudutech.peanut.tp;

import com.pudutech.peanut.tp.camera.ITpCameraMarkerFrameCallback;
import com.pudutech.peanut.tp.camera.ITpCameraPalletFrameCallback;

// Reconstructed from the guide, section 3.1. Method order follows the document; transaction
// codes depend on it, so replace with the official AAR if calls hit the wrong method.
interface ITpRobotGatewayService {
    void addMonoCameraListener(String name, ITpCameraMarkerFrameCallback callback);
    void removeMonoCameraListener(String name);
    void addMarkCameraListener(String name, ITpCameraMarkerFrameCallback callback);
    void removeMarkCameraListener(String name);
    void addPalletCameraListener(String name, ITpCameraPalletFrameCallback callback);
    void removePalletCameraListener(String name);
    void runMonocularCamera();
    void stopMonocularCamera();
    void runMarkerCamera();
    void stopMarkerCamera();
}
