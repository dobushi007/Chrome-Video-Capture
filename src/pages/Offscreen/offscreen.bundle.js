import { OffscreenEvents, RecordingEvents } from '../../common/util';

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.target === 'offscreen') {
    switch (message.type) {
      case OffscreenEvents.startCapture:
        startCapture(message.data);
        break;
      case OffscreenEvents.stopCapture:
        stopCapture();
        break;
      default:
        throw new Error('Unrecognized message:', message.type);
    }
  }
  return true;
});

let videoRecorder;
let videoBlobs = [];
let videoStartTime;
let videoEndTime;

function calculateBitrate(width, height) {
  const pixels = width * height;

  // Base bitrate is chosen based on common standards and might need adjustments
  // For 1080p (Full HD)
  if (pixels <= 1920 * 1080) {
    return 5000000; // 5 Mbps
  }
  // For 1440p (2K)
  else if (pixels <= 2560 * 1440) {
    return 10000000; // 10 Mbps
  }
  // For 2160p (4K)
  else if (pixels <= 3840 * 2160) {
    return 20000000; // 20 Mbps
  }
  // For 4320p (8K)
  else if (pixels <= 7680 * 4320) {
    return 50000000; // 50 Mbps
  }
  // For anything larger than 8K
  else {
    return 100000000; // 100 Mbps or more, adjust as needed
  }
}

async function startCapture(data) {
  if (videoRecorder?.state === 'recording') {
    throw new Error('Called startRecording while recording is in progress.');
  }

  const { streamId, constraints } = data;
  console.log(navigator.mediaDevices.getSupportedConstraints());

  const media = await navigator.mediaDevices.getUserMedia({
    video: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
        minHeight: constraints.minHeight,
        maxHeight: constraints.maxHeight,
        minWidth: constraints.minWidth,
        maxWidth: constraints.maxWidth,
        frameRate: constraints.maxFrameRate,
      },
    },
  });

  // Start recording.
  videoRecorder = new MediaRecorder(media, {
    mimeType: 'video/webm; codecs=vp9',
    audioBitsPerSecond: 0,
    videoBitsPerSecond: calculateBitrate(
      constraints.maxWidth,
      constraints.maxHeight
    ),
  });
  videoRecorder.ondataavailable = (e) => {
    videoBlobs.push(e.data);
  };
  videoRecorder.onstart = () => {
    videoStartTime = Date.now();
  };
  videoRecorder.onstop = () => {
    videoEndTime = Date.now();
    const videoBlob = new Blob(videoBlobs, {
      type: 'video/webm; codecs=vp9',
    });

    function blobToDataUrl(blob, callback) {
      const reader = new FileReader();
      reader.onload = function () {
        callback(reader.result);
      };
      reader.readAsDataURL(blob);
    }

    //TODO: remove this url

    const url = URL.createObjectURL(videoBlob);

    videoRecorder.stream.getTracks().forEach((e) => e.stop());

    blobToDataUrl(videoBlob, (dataUrl) => {
      chrome.runtime.sendMessage({
        type: RecordingEvents.onRecordingReady,
        target: 'background',
        data: {
          videoUrl: url,
          blobUrl: dataUrl,
          videoStartTime,
          videoEndTime,
        },
      });
    });
    //clear state after
    videoRecorder = undefined;
    videoBlobs = [];
  };

  videoRecorder.stream.getVideoTracks()[0].onended = () => {
    this.videoRecorder &&
      this.videoRecorder.state !== 'inactive' &&
      this.videoRecorder.stop();
  };
  videoRecorder.start();

  // Record the current state in the URL. This provides a very low-bandwidth
  // way of communicating with the service worker (the service worker can check
  // the URL of the document and see the current recording state). We can't
  // store that directly in the service worker as it may be terminated while
  // recording is in progress. We could write it to storage but that slightly
  // increases the risk of things getting out of sync.
  window.location.hash = 'recording';
}

async function stopCapture() {
  videoRecorder.stop();
  videoEndTime = Date.now();
  // Update current state in URL
  window.location.hash = '';

  // Note: In a real extension, you would want to write the recording to a more
  // permanent location (e.g IndexedDB) and then close the offscreen document,
  // to avoid keeping a document around unnecessarily. Here we avoid that to
  // make sure the browser keeps the Object URL we create (see above) and to
  // keep the sample fairly simple to follow.
}
