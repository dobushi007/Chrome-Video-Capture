import { OffscreenEvents, RecordingEvents } from '../../../common/util';
import moment from 'moment';

export enum RecorderStatus {
  IDLE = 'idle',
  RECORDING = 'recording',
}

export default class Recorder {
  status: RecorderStatus = RecorderStatus.IDLE;
  videoTabId: number | undefined;
  videoTabTitle?: string;
  videoTabUrl?: string;
  videoRecorder?: MediaRecorder;
  videoBlobs: Blob[] = [];
  videoStartMs: number = 0;
  videoEndMs: number = 0;
  videoHeight: number = 0;
  videoWidth: number = 0;
  aspectRatio: number = 1;
  streamId: number = 0;
  videoUrl: string = '';
  creatingOffscreen?: Promise<any>;

  resetState() {
    this.status = RecorderStatus.IDLE;
    this.videoTabId = 0;
    this.videoTabTitle = undefined;
    this.videoTabUrl = undefined;
    this.videoRecorder = undefined;
    this.videoBlobs = [];
    this.videoStartMs = 0;
    this.videoEndMs = 0;
    this.aspectRatio = 1;
    this.streamId = 0;
    this.videoUrl = '';
    this.videoHeight = 0;
    this.videoWidth = 0;
    this.closeOffscreenDocument();
  }

  async downloadVideo(request: any, sender: any, sendResponse: any) {
    switch (request.type) {
      case 'downloadManuallyVideo':
        const videoUrl = await chrome.storage.local.get('videoUrl');
        console.log('video url from', videoUrl);
        chrome.downloads.download({
          url: videoUrl.videoUrl,
          filename: `${moment().format('YYYY-MM-DD')}-screencapture.webm`,
        });
        break;
      default:
        break;
    }
  }

  async setupOffscreenDocument(path: string) {
    if (await this.hasDocument()) return;

    // create offscreen document
    if (this.creatingOffscreen) {
      await this.creatingOffscreen;
    } else {
      this.creatingOffscreen = chrome.offscreen.createDocument({
        url: path,
        reasons: [chrome.offscreen.Reason.USER_MEDIA],
        justification: 'Recording from chrome.tabCapture API',
      });
      await this.creatingOffscreen;
      this.creatingOffscreen = undefined;
    }
  }

  async closeOffscreenDocument() {
    if (await this.hasDocument())
      // @ts-ignore
      await chrome.offscreen.closeDocument();
  }

  async hasDocument(): Promise<boolean> {
    // @ts-ignore
    const existingContexts = await chrome.runtime.getContexts({});

    const offscreenDocument = existingContexts.find(
      (c: any) => c.contextType === 'OFFSCREEN_DOCUMENT'
    );
    return offscreenDocument ? true : false;
  }

  async start() {
    if (this.status !== RecorderStatus.IDLE)
      return `Can't start recording while Recorder.status is " + ${this.status}`;
    this.resetState();
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab || !tab.height || !tab.width) return `Tab is not ready!`;

    // Create an offscreen document.
    await this.setupOffscreenDocument('/offscreen.html');
    // Get a MediaStream for the active tab.
    // @ts-ignore
    this.streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tab.id,
    });
    this.videoHeight = tab.height * 2;
    this.videoWidth = tab.width * 2;
    // Send the stream ID to the offscreen document to start recording.
    chrome.runtime.sendMessage({
      type: OffscreenEvents.startCapture,
      target: 'offscreen',
      data: {
        streamId: this.streamId,
        constraints: {
          minHeight: 2 * tab.height,
          maxHeight: 2 * tab.height,
          minWidth: 2 * tab.width,
          maxWidth: 2 * tab.width,
          maxFrameRate: 30,
        },
      },
    });
    chrome.runtime.onMessage.addListener(this.downloadVideo);

    this.status = RecorderStatus.RECORDING;
    this.videoTabId = tab.id;
    this.videoTabTitle = tab.title || '';
    this.videoTabUrl = tab.url;
    this.videoStartMs = Date.now();
    await chrome.storage.sync.set({ recording: true });
  }

  async stop() {
    if (this.status === RecorderStatus.IDLE)
      return `Can't stop recording while Recorder.status is " + ${this.status}`;
    chrome.storage.sync.set({ recording: false });
    await chrome.runtime.sendMessage({
      type: OffscreenEvents.stopCapture,
      target: 'offscreen',
      data: this.streamId,
    });
    this.videoEndMs = Date.now();
  }
}
