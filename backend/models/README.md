# OpenCV model files

The `.onnx` files in this folder are public pretrained OpenCV Zoo models. They are model weights, not student photos or enrolled face data.

- `face_detection_yunet_2023mar.onnx` — YuNet, fixed-shape model supported by OpenCV 4.x. The OpenCV Zoo model directory licenses YuNet files under MIT.
- `face_recognition_sface_2021dec.onnx` — SFace embedding model; the OpenCV Zoo model directory licenses its files under Apache-2.0.

Source pages: [YuNet model](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet) and [SFace model](https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface). The application uses OpenCV's `FaceDetectorYN` and `FaceRecognizerSF` APIs. OpenCV Zoo's SFace example uses 0.363 as a starting cosine-similarity threshold; this project exposes it as `FACE_MATCH_THRESHOLD` and rejects close competing matches.

For a clean checkout, download the files from the official OpenCV Zoo media URLs:

```powershell
$models = ".\backend\models"
Invoke-WebRequest "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx" -OutFile "$models\face_detection_yunet_2023mar.onnx"
Invoke-WebRequest "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx" -OutFile "$models\face_recognition_sface_2021dec.onnx"
```
