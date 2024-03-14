export enum RecordingEvents {
  startRecording = 'startRecording',
  stopRecording = 'stopRecording',
  onRecordingReady = 'onRecordingReady',
  getRecordingState = 'getRecordingState',
}

export enum BackgroundEvents {
  getWindowSize = 'getWindowSize',
  resetCapture = 'bg.resetCapture',
  takeScreenshot = 'bg.takeScreenshot',
  setBoundsListener = 'bg.setBoundsListener',
  removeBoundsListener = 'bg.removeBoundsListener',
}

export enum ContentEvents {
  getWindowZoom = 'getWindowZoom',
  setWindowZoom = 'setWindowZoom',
  startCountdown = 'startCountdown',
}

export enum OffscreenEvents {
  startCapture = 'startCapture',
  stopCapture = 'stopCapture',
}

export enum PopupEvents {
  onBoundsChanged = 'onBoundsChanged',
}

export enum UploadStatus {
  IDLE = 'upload.idle',
  UPLOADING = 'upload.uploading',
  SUCCESS = 'upload.success',
  ERROR = 'upload.error',
}
