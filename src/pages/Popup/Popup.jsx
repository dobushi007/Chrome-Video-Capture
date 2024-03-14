import React, { useEffect, useState } from 'react';
import Button from '../../components/Button';
import logo from '../../assets/img/logo.svg';
import settingsImg from '../../assets/icons/settings.svg';
import loaderImg from '../../assets/icons/loader.svg';
import UploadLoader from '../../assets/icons/loader_page_white.svg';
import CheckIcon from '../../assets/icons/check_icon.svg';
import logoutImg from '../../assets/icons/logout.png';
import '../../assets/styles/tailwind.css';
import {
  BackgroundEvents,
  ContentEvents,
  RecordingEvents,
  UploadStatus,
  PopupEvents,
} from '../../common/util';
import { RecorderStatus } from '../Background/modules/Recorder';
import { useAuth0 } from '@auth0//auth0-react';
import secrets from 'secrets';

const Popup = () => {
  const [displayInfo, setDisplayInfo] = useState({ __html: '' });
  const [winWidth, setWinWidth] = useState(1920);
  const [winHeight, setWinHeight] = useState(1080);
  const [winZoom, setWinZoom] = useState(100);
  const [tab, setTab] = useState();
  const [resizeError, setResizeError] = useState(null);
  const [decorHeight, setDecorHeight] = useState(0);
  const [workSpacesList, setWorkSpacesList] = useState(null);
  const [selectedWorkSpaceId, setSelectedWorkSpaceId] = useState(null);
  const [message, setMessage] = useState();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingFailed, setUploadingFailed] = useState(false);
  const [uploadingSuccess, setUploadingSuccess] = useState(false);
  const [advanced, setAdvanced] = useState(1);
  const [isOnScreenSpace, setIsOnScreenSpace] = useState(false);
  const [showCheck, setShowCheck] = useState(false);
  const { getAccessTokenSilently, isAuthenticated, logout, isLoading } =
    useAuth0();
  const [authenticated, setAuthenticated] = useState(isAuthenticated);

  useEffect(() => {
    (async () => {
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
        highlighted: true,
      });
      if (tabs[0].url.includes('chrome://')) {
        console.log('can`t run on start page');
      } else if (tabs[0].url.includes('screenspace.io')) {
        setIsOnScreenSpace(true);
      } else {
        chrome.storage.local.get('token').then((result) => {
          setAuthenticated(result.token ? true : false);
        });
        const { workSpaces } = await chrome.storage.local.get('workSpaces');
        setTab(tabs[0]);
        setWorkSpacesList(workSpaces ?? null);
        setSelectedWorkSpaceId(workSpaces?.[0]?.workspace_uuid ?? null);
        checkRecordingStatus();
        checkUploadStatus();
        checkIsResizedStatus();
        calculateAndSetOptimalSizeAndZoom();
        try {
          const token = await getAccessTokenSilently();
          getUserWorkSpaces(token);
          signIn(token);
        } catch (e) {
          signOut();
        }
      }
    })();
  }, []);

  chrome.runtime.onMessage.addListener(
    async (request, sender, sendResponse) => {
      if (request.type === PopupEvents.onBoundsChanged) {
        await chrome.storage.local.set({ isResized: true });
        checkIsResizedStatus();
      } else if (
        [
          UploadStatus.UPLOADING,
          UploadStatus.SUCCESS,
          UploadStatus.ERROR,
          UploadStatus.IDLE,
        ].includes(request.type)
      ) {
        handleUploadState(request.type);
      }
    }
  );

  async function calculateAndSetOptimalSizeAndZoom(tab) {
    const displays = await chrome.system.display.getInfo();
    setDisplayInfo(displays[0]);
    const windowSize = await chrome.runtime.sendMessage({
      type: BackgroundEvents.getWindowSize,
    });
    const optimalSize = findNearestOptimalSize(
      displays[0].workArea.width,
      displays[0].workArea.height -
        (windowSize.outerHeight - windowSize.innerHeight)
    );
    const zoomFactor = Math.round((optimalSize[0] / 1920) * 100);
    setDecorHeight(windowSize.outerHeight - windowSize.innerHeight);
    setWinWidth(optimalSize[0]);
    setWinHeight(optimalSize[1]);
    setWinZoom(zoomFactor * 1.2); //adding 20% of calculated zoom factor
  }

  const openLoginPage = () => {
    chrome.tabs.create({ url: 'https://app.screenspace.io/' });
  };

  const signIn = (token) => {
    chrome.storage.local.set({ token });
    setAuthenticated(true);
  };

  const signOut = () => {
    chrome.storage.local.remove('token');
    logout({ federated: true, returnTo: window.location.origin });
    setAuthenticated(false);
    fetch(
      `https://${secrets.AUTH0_DOMAIN}/v2/logout?federated=true&client_id=${secrets.AUTH0_CLIENT_ID}`,
      {
        credentials: 'include',
        mode: 'no-cors',
      }
    ).catch();
  };

  function findNearestOptimalSize(w, h) {
    if (w / h < 16 / 9) {
      w = Math.floor(w / 16) * 16;
      h = Math.floor(w / 16) * 9;
    } else {
      h = Math.floor(h / 9) * 9;
      w = Math.floor(h / 9) * 16;
    }
    return [w, h];
  }

  const resetToInitialState = async () => {
    chrome.runtime.sendMessage({
      type: BackgroundEvents.resetCapture,
    });
    setIsUploading(false);
    setUploadingSuccess(false);
    setUploadingFailed(false);
  };

  const handleUploadState = (state) => {
    switch (state) {
      case UploadStatus.UPLOADING:
        setMessage('Uploading..');
        setUploadingSuccess(false);
        setUploadingFailed(false);
        setIsUploading(true);
        break;
      case UploadStatus.ERROR:
        setIsUploading(false);
        setUploadingSuccess(false);
        setUploadingFailed(true);
        setMessage(
          'Oh no! Your upload failed. We have been notified. In the meantime, click below to save your capture and upload manually'
        );
        break;
      case UploadStatus.SUCCESS:
        setIsUploading(false);
        setUploadingFailed(false);
        setUploadingSuccess(true);
        setMessage('Media uploaded succesfully!');
        break;
      default:
        break;
    }
  };

  const resizeWindow = async () => {
    async function resize() {
      if (
        winWidth > displayInfo.workArea.width ||
        winHeight > displayInfo.workArea.height
      )
        return;
      const wind = await chrome.windows.getCurrent();
      chrome.windows.update(wind.id, {
        top: Math.round(
          displayInfo.workArea.height / 2 - (winHeight + decorHeight) / 2
        ),
        left: Math.round(displayInfo.workArea.width / 2 - winWidth / 2),
        width: winWidth,
        height: winHeight + decorHeight,
      });
      setZoom(winZoom);
    }
    await resize();
    setTimeout(resize, 200); // fix for mac
  };

  const setZoom = (zoomFactor) => {
    chrome.tabs.sendMessage(tab.id, {
      type: ContentEvents.setWindowZoom,
      data: {
        zoom: zoomFactor / 100 || winZoom / 100,
      },
    });
  };

  const takeScreenshot = async () => {
    chrome.storage.local.set({ eventType: 'screenshot' });
    await chrome.runtime.sendMessage({
      type: BackgroundEvents.takeScreenshot,
    });
  };

  const startRecording = async () => {
    chrome.storage.local.set({ eventType: 'screen_recording' });
    chrome.tabs.sendMessage(tab.id, {
      type: ContentEvents.startCountdown,
    });
    chrome.action.setIcon({
      path: './icon-128-recording.png',
    });
    setTimeout(() => {
      window.close();
    }, 200);
  };

  const stopRecording = async () => {
    await chrome.runtime.sendMessage({
      type: RecordingEvents.stopRecording,
    });
    chrome.action.setIcon({
      path: 'icon-128.png',
    });
  };

  async function checkRecordingStatus() {
    const { recorderStatus } = await chrome.runtime.sendMessage({
      type: RecordingEvents.getRecordingState,
    });
    if (recorderStatus === RecorderStatus.RECORDING) {
      stopRecording();
    }
  }

  const handleAutomaticResize = async () => {
    await chrome.storage.local.set({ xzed: true });
    await resizeWindow();
    setTimeout(() => {
      chrome.runtime.sendMessage({
        type: BackgroundEvents.setBoundsListener,
      });
    }, 1000);
    setShowCheck(true);
  };

  const getUserWorkSpaces = async (token) => {
    const response = await fetch(
      'https:/api.screenSpace.io:8080/api/workspaces?list',
      {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Requested-With': 'SSChromeExtension',
        },
        method: 'GET',
      }
    );
    let { data } = await response.json();
    if (data.length) {
      chrome.storage.local.set({ workSpaces: data });
      setSelectedWorkSpaceId(data[0].workspace_uuid);
      chrome.storage.local.set({ workSpaceId: data[0].workspace_uuid });
      setWorkSpacesList(data);
    }
  };

  async function checkUploadStatus() {
    const result = await chrome.storage.local.get('uploadStatus');
    handleUploadState(result.uploadStatus);
  }

  async function checkIsResizedStatus() {
    const result = (await chrome.storage.local.get('isResized')) ?? true;
    setShowCheck(!result);
  }

  const handleSelectedWorkspaceChange = (e) => {
    setSelectedWorkSpaceId(e.target.value);
    chrome.storage.local.set({ workSpaceId: e.target.value });
  };

  const handleDownloadManually = async () => {
    const eventType = await chrome.storage.local.get('eventType');
    if (eventType.eventType === 'screenshot') {
      chrome.runtime.sendMessage({
        type: 'downloadManuallyImage',
      });
    } else if (eventType.eventType === 'screen_recording') {
      chrome.runtime.sendMessage({
        type: 'downloadManuallyVideo',
      });
    }
    resetToInitialState();
  };

  const handleModeSwitch = async () => {
    await calculateAndSetOptimalSizeAndZoom();
    setAdvanced((prevVal) => {
      return !prevVal;
    });
  };

  return (
    <div
      id="popUpContainer"
      className={`flex flex-col bg-[linear-gradient(45deg,rgb(180,97,255)_0%,rgb(236,78,248)_100%)] p-4 text-white`}
    >
      {/* HEADER */}
      <div className="flex flex-row align-middle items-center space-x-2">
        <a target="_blank" href="https://www.screenspace.io/" rel="noreferrer">
          <img className="h-8 w-auto" src={logo} alt="logo" />{' '}
        </a>
        <div className="flex-grow"></div>
        <img
          className="h-6 p-[1px] bg-white/20 hover:bg-white/25 border rounded-md border-solid border-[rgba(255,255,255,0.3)] transition-transform duration-[0.3s] shadow-[1px_1px_20px_rgba(0,0,0,0.1)] backdrop-blur-[30px]"
          src={settingsImg}
          alt="settings"
        />
        <img
          className={`${
            authenticated ? 'show' : 'hidden'
          } h-6 p-[1px] opacity-95 bg-white/20 hover:bg-white/25 border rounded-md border-solid border-[rgba(255,255,255,0.3)] transition-transform duration-[0.3s] shadow-[1px_1px_20px_rgba(0,0,0,0.1)] backdrop-blur-[30px]`}
          src={logoutImg}
          alt="settings"
          onClick={signOut}
        />
      </div>

      {isOnScreenSpace ? (
        <div className="mt-5 text-center p-2 border rounded-md border-solid border-[rgba(255,255,255,0.3)] bg-[rgba(180,97,255,0.2)] backdrop-blur-[30px] shadow-[1px_1px_20px_rgba(0,0,0,0.1)]">
          <h1 className="text-sm font-medium">
            Please browse to your product to get started.
          </h1>
        </div>
      ) : null}

      {/* CONTENT */}
      {authenticated ? (
        <>
          {/* WORKSPACE */}
          <div className="mt-5 flex flex-row justify-between items-center">
            <div className="mr-4">
              <span className="text-sm font-medium">Workspaces</span>
            </div>
            <div className="w-full">
              <select
                className="w-full text-center text-white flex-grow placeholder:text-gray-200 p-2 border rounded-md border-solid border-[rgba(255,255,255,0.2)] bg-[rgba(255,255,255,0.1)] backdrop-blur-[30px] focus:outline-none focus:border-[#B461FF] focus:ring-[#B461FF] focus:ring-1"
                name="workspaces"
                defaultValue={selectedWorkSpaceId}
                onChange={handleSelectedWorkspaceChange}
              >
                {workSpacesList?.map((workspace) => {
                  return (
                    <option
                      key={workspace.workspace_uuid}
                      className="bg-purple-400 text-center"
                      value={workspace.workspace_uuid}
                    >
                      {workspace.name}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {/* MODES */}
          <div className="mt-5 flex flex-row justify-between items-center">
            <div className="mr-4">
              <span className="text-sm font-medium">
                Show Advanced Settings
              </span>
            </div>
            <div>
              <label className="switch">
                <input
                  type="checkbox"
                  onChange={handleModeSwitch}
                  value={advanced}
                />
                <span className="slider round"></span>
              </label>
            </div>
          </div>
          {/* RESIZE CONTAINER */}
          {advanced ? (
            <div className="mt-5 flex flex-col p-2 border rounded-md border-solid border-[rgba(255,255,255,0.3)] bg-[rgba(180,97,255,0.2)] backdrop-blur-[30px] shadow-[1px_1px_20px_rgba(0,0,0,0.1)]">
              <p className="text-sm">Would you like to resize your window?</p>
              <div className="mt-5 flex justify-between items-center">
                <Button className="w-full " onClick={handleAutomaticResize}>
                  Resize
                </Button>
                {showCheck ? (
                  <img
                    className="ml-2"
                    height="24px"
                    width="24px"
                    src={CheckIcon}
                    alt="check_icon"
                  />
                ) : null}
              </div>
            </div>
          ) : (
            <div className="mt-5 flex flex-col p-2 border rounded-md border-solid border-[rgba(255,255,255,0.3)] bg-[rgba(180,97,255,0.2)] backdrop-blur-[30px] shadow-[1px_1px_20px_rgba(0,0,0,0.1)]">
              <p className="text-sm">Would you like to resize your window?</p>
              {/* CONTROLS */}
              <div className="mt-2 grid grid-cols-3 gap-2">
                {/* RESOLUTION */}
                <div className="flex flex-row col-span-2">
                  <input
                    type="text"
                    id="width"
                    className="min-w-0 text-center text-white flex-grow placeholder:text-gray-200 p-2 border rounded-md border-solid border-[rgba(255,255,255,0.2)] bg-[rgba(255,255,255,0.1)] backdrop-blur-[30px] focus:outline-none focus:border-[#B461FF] focus:ring-[#B461FF] focus:ring-1"
                    placeholder="Width"
                    onChange={(e) => {
                      const width = Number(e.target.value);
                      if (width > displayInfo.workArea.width) {
                        setResizeError(
                          `The maximum size available for your screen is ${displayInfo.bounds.width}x${displayInfo.bounds.height}`
                        );
                        setWinWidth(winWidth);
                      } else {
                        setResizeError(null);
                        setWinWidth(width);
                      }
                    }}
                    value={winWidth}
                    required
                  />
                  <span className="mx-1 text-xl">x</span>
                  <input
                    type="text"
                    id="height"
                    className="min-w-0 text-center text-white flex-grow placeholder:text-gray-200 p-2 border rounded-md border-solid border-[rgba(255,255,255,0.2)] bg-[rgba(255,255,255,0.1)] backdrop-blur-[30px] focus:outline-none focus:border-[#B461FF] focus:ring-[#B461FF] focus:ring-1"
                    placeholder="Height"
                    onChange={(e) => {
                      const height = Number(e.target.value);
                      if (height > displayInfo.workArea.height) {
                        setResizeError(
                          `The maximum size available for your screen is ${displayInfo.workArea.width}x${displayInfo.workArea.height}`
                        );
                        setWinHeight(winHeight);
                      } else {
                        setResizeError(null);
                        setWinHeight(Number(e.target.value));
                      }
                    }}
                    value={winHeight}
                    required
                  />
                </div>
                <Button onClick={resizeWindow}>Resize</Button>

                {/* ZOOM */}
                <div className="col-span-2 flex flex-row">
                  <input
                    type="text"
                    id="width"
                    className="min-w-0 flex-grow text-center text-white placeholder:text-gray-200 p-2 border rounded-md border-solid border-[rgba(255,255,255,0.2)] bg-[rgba(255,255,255,0.1)] backdrop-blur-[30px] focus:outline-none focus:border-[#B461FF] focus:ring-[#B461FF] focus:ring-1"
                    placeholder="Zoom"
                    onChange={(e) => {
                      const zoom = Number(e.target.value);
                      if (zoom > 500) {
                        setResizeError(`Invalid Zoom Level`);
                        setWinZoom(winZoom);
                      } else {
                        setResizeError(null);
                        setWinZoom(zoom);
                      }
                    }}
                    value={winZoom}
                    required
                  />
                </div>
                <Button onClick={setZoom}>Zoom</Button>
              </div>

              {/* ERROR */}
              {resizeError && (
                <div className="bg-red-400/90 p-1 text-xs mt-2 border border-red-400 rounded-md text-center">
                  {resizeError}
                </div>
              )}
            </div>
          )}
          {/* CAPTURE BUTTONS */}
          <Button className="mt-5 w-full" onClick={startRecording}>
            Record Video
          </Button>

          <Button className="mt-2 w-full" onClick={takeScreenshot}>
            Capture Screenshot
          </Button>

          {/* UPLOAD MESSAGES */}
          <div
            className={
              isUploading || uploadingSuccess || uploadingFailed
                ? 'absolute top-0 h-full bg-[linear-gradient(45deg,rgb(180,97,255)_0%,rgb(236,78,248)_100%)] w-full left-0 z-50 flex justify-center items-center'
                : 'hidden'
            }
          >
            {isUploading ? (
              <div className="flex flex-col ustify-center items-center">
                <img src={UploadLoader} alt="uploading..." />
                <div className="text-center mt-2">
                  <span className="text-sm font-bold">Uploading...</span>
                </div>
              </div>
            ) : null}

            {uploadingSuccess ? (
              <div className="flex flex-col ustify-center items-center">
                <div className="max-w-[250px] text-sm font-bold text-center">
                  <span>{message}</span>
                </div>
                <div className="flex flex-row justify-center items-center space-x-2 mt-5">
                  <Button onClick={resetToInitialState}>New Capture</Button>
                  <a
                    target="_blank"
                    href="https://app.screenspace.io/dashboard"
                    rel="noreferrer"
                  >
                    <Button onClick={resetToInitialState}>Done</Button>
                  </a>
                </div>
              </div>
            ) : null}

            {uploadingFailed ? (
              <div className="flex flex-col ustify-center items-center">
                <div style={{ maxWidth: '250px', textAlign: 'center' }}>
                  <span className="text-sm font-bold">{message}</span>
                </div>
                <Button className="mt-5" onClick={handleDownloadManually}>
                  Save Capture
                </Button>
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <Button
          className={`mt-5 w-full flex items-center justify-center ${
            isOnScreenSpace ? 'hidden' : 'show'
          }`}
          onClick={openLoginPage}
        >
          {isLoading ? (
            <img
              className="animate-spin h-5 w-5"
              viewBox="0 0 24 24"
              alt="loader"
              src={loaderImg}
            />
          ) : (
            'Login'
          )}
        </Button>
      )}
    </div>
  );
};

export default Popup;
