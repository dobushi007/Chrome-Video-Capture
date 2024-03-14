import {
  RecordingEvents,
  UploadStatus,
  BackgroundEvents,
  PopupEvents,
  ContentEvents,
} from '../../common/util';
import Recorder from './modules/Recorder';
import * as moment from 'moment';
import { v4 as uuid } from 'uuid';
import { getBlobFromDataUrl } from '../../../utils';
import secrets from '../../../secrets.development';

let currentScreenshotDataUrl = null;
let recorder = new Recorder();
let zoom = 100;

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  switch (request.type) {
    case BackgroundEvents.getWindowSize:
      calculateWindowSize().then((res) => sendResponse(res));
      break;
    case BackgroundEvents.takeScreenshot:
      setPageZoom();
      chrome.tabs.captureVisibleTab(null, { format: 'jpeg' }, async (t) => {
        currentScreenshotDataUrl = t;
        uploadImage(currentScreenshotDataUrl);
        sendResponse({ msg: 'take-screenshot' });
      });
      break;
    case RecordingEvents.startRecording:
      setPageZoom();
      recorder.start();
      sendResponse({ msg: 'start-recording' });
      break;
    case RecordingEvents.stopRecording:
      recorder.stop();
      sendResponse({ msg: 'stop-recording' });
      break;
    case RecordingEvents.onRecordingReady:
      console.log(request.data);
      uploadAsset(
        request.data.videoUrl,
        request.data.blobUrl,
        request.data.videoStartTime,
        request.data.videoEndTime
      );
      sendResponse({ msg: 'recording-recevied' });
      break;
    case RecordingEvents.getRecordingState:
      sendResponse({ recorderStatus: recorder.status });
      break;
    case BackgroundEvents.resetCapture:
      recorder.resetState();
      chrome.storage.local.set({ uploadStatus: UploadStatus.IDLE });
      chrome.runtime.sendMessage({ type: UploadStatus.IDLE });
      sendResponse({ msg: 'capture-reset' });
      break;
    case BackgroundEvents.setBoundsListener:
      chrome.windows.onBoundsChanged.addListener(handleBoundsChange);
      sendResponse({ msg: 'bounds-listener-set' });
      break;
    case BackgroundEvents.removeBoundsListener:
      chrome.windows.onBoundsChanged.removeListener(handleBoundsChange);
      sendResponse({ msg: 'bounds-listener-removed' });
      break;
    default:
      break;
  }
  return true;
});

async function handleBoundsChange() {
  chrome.windows.onBoundsChanged.removeListener(handleBoundsChange);
  await chrome.storage.local.set({ isResized: true });
  chrome.runtime.sendMessage({ type: PopupEvents.onBoundsChanged });
}

async function handleUploadFailed() {
  await chrome.storage.local.set({ uploadStatus: UploadStatus.ERROR });
  chrome.runtime.sendMessage({ type: UploadStatus.ERROR });
}

async function handleUploadSuccess() {
  await chrome.storage.local.set({ uploadStatus: UploadStatus.SUCCESS });
  chrome.runtime.sendMessage({ type: UploadStatus.SUCCESS });
}
async function uploadImage(url) {
  await chrome.storage.local.set({ uploadStatus: UploadStatus.UPLOADING });
  chrome.runtime.sendMessage({ type: UploadStatus.UPLOADING });
  chrome.storage.local.set({ imageUrl: url });
  const blob = getBlobFromDataUrl(url);
  const imgBitmap = await createImageBitmap(blob);
  const height = imgBitmap.height;
  const width = imgBitmap.width;
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || !tab.height || !tab.width) return `Tab is not ready!`;
  const imageUuid = uuid();
  const uploadUrl = await getAWSAccessURL(imageUuid);
  await uploadImageBlob(uploadUrl, blob, imageUuid);
  await await convertImage(
    `${Date.now()}-screenshot.jpeg`,
    uuid,
    width,
    height,
    tab
  );
}
async function uploadAsset(url, blobUrl, startTime, endTime) {
  try {
    await chrome.storage.local.set({ uploadStatus: UploadStatus.UPLOADING });
    chrome.runtime.sendMessage({ type: UploadStatus.UPLOADING });
    chrome.storage.local.set({ videoUrl: url });
    const videoUuid = uuid();
    const uploadUrl = await getAWSAccessURLVideo(videoUuid);
    await uploadVideoBlob(uploadUrl, getBlobFromDataUrl(blobUrl));
    await finishUpload(
      `${Date.now()}-screenrecording.webm`,
      videoUuid,
      startTime,
      endTime
    );

    handleUploadSuccess();
  } catch (e) {
    handleUploadFailed();
  }
}

chrome.runtime.onMessage.addListener(async function (
  request,
  sender,
  sendResponse
) {
  switch (request.type) {
    case 'downloadManuallyImage':
      const imageUrl = await chrome.storage.local.get('imageUrl');
      chrome.downloads.download({
        url: imageUrl.imageUrl,
        filename: `${moment().format('YYYY-MM-DD')}-screenshot.jpeg`,
      });
      break;
    default:
      break;
  }
});

async function calculateWindowSize() {
  const window = await chrome.windows.getCurrent();
  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true,
    highlighted: true,
  });
  return {
    innerWidth: tabs[0].width,
    innerHeight: tabs[0].height,
    outerWidth: window.width,
    outerHeight: window.height,
  };
}

async function setPageZoom() {
  zoom = -1;
  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true,
    highlighted: true,
  });
  if (tabs[0]) {
    const { pageZoom } = await chrome.tabs.sendMessage(tabs[0].id, {
      type: ContentEvents.getWindowZoom,
    });
    zoom = pageZoom ? Number(pageZoom) : -1;
  }
}

async function getAWSAccessURL(uuid) {
  const token = await chrome.storage.local.get('token');
  try {
    const response = await fetch(`${secrets.API_URL}/request-upload`, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token.token}`,
        'X-Requested-With': 'SSChromeExtension',
      },
      method: 'POST',
      body: JSON.stringify({
        key: `screenshot/${uuid}.jpeg`,
        ContentType: 'image/jpeg',
        CacheControl: 'no-store',
        Bucket: 'media',
      }),
    });
    let url = await response.text();
    return url;
  } catch (error) {
    handleUploadFailed();
  }
}

async function convertImage(fileName, uuid, width, height, tab) {
  const token = await chrome.storage.local.get('token');
  const workspaceId = await chrome.storage.local.get('workSpaceId');
  try {
    await fetch(`${secrets.API_URL}/chrome_extension?upload_complete=true`, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token.token}`,
        'X-Requested-With': 'SSChromeExtension',
      },
      method: 'POST',
      body: JSON.stringify({
        original_filename: fileName,
        asset_uuid: uuid,
        media_type: 'image',
        extension: 'jpeg',
        status: 'done',
        asset_type: 'chrome_extension',
        workspace_uuid: workspaceId.workSpaceId,
        width,
        height,
        duration: '0.00',
        capture_page_title: tab.title || '',
        capture_page_url: tab.url || '',
        capture_width: width,
        capture_height: height,
        capture_zoom: zoom,
      }),
    });
    handleUploadSuccess();
  } catch (error) {
    handleUploadFailed();
  }
}

async function uploadImageBlob(url, blob, uuid) {
  try {
    await fetch(url, {
      headers: {
        'Content-Type': 'image/jpeg',
      },
      method: 'PUT',
      body: blob,
    });
  } catch (error) {
    handleUploadFailed();
  }
}

async function getAWSAccessURLVideo(uuid) {
  const token = await chrome.storage.local.get('token');
  const response = await fetch(
    `https://api.screenspace.io:8080/request-upload`,
    {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token.token}`,
        'X-Requested-With': 'SSChromeExtension',
      },
      method: 'POST',
      body: JSON.stringify({
        key: `videos_raw/${uuid}.webm`,
        ContentType: 'video/webm',
        CacheControl: 'no-store',
        Bucket: 'media',
      }),
    }
  );
  let url = await response.text();
  return url;
}

async function uploadVideoBlob(url, blob) {
  return await fetch(url, {
    headers: {
      'Content-Type': 'video/webm',
    },
    method: 'PUT',
    body: blob,
  });
}

async function finishUpload(fileName, uuid, startTime, endTime) {
  console.log('start time end time', startTime, endTime);
  const token = await chrome.storage.local.get('token');
  const workspaceId = await chrome.storage.local.get('workSpaceId');
  let duration = (endTime - startTime) / 1000;
  console.log('calculated duration:', duration);
  return await fetch(
    `https://api.screenspace.io:8080/chrome_extension?upload_complete=true`,
    {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token.token}`,
        'X-Requested-With': 'SSChromeExtension',
      },
      method: 'POST',
      body: JSON.stringify({
        original_filename: fileName,
        asset_uuid: uuid,
        media_type: 'video',
        extension: 'webm',
        status: 'converting',
        asset_type: 'chrome_extension',
        workspace_uuid: workspaceId.workSpaceId,
        width: recorder.videoWidth.toString(),
        height: recorder.videoHeight.toString(),
        duration: duration.toFixed(2).toString(),
        capture_page_title: recorder.videoTabTitle,
        capture_page_url: recorder.videoTabUrl,
        capture_width: recorder.videoWidth,
        capture_height: recorder.videoHeight,
        capture_zoom: zoom,
      }),
    }
  );
}
