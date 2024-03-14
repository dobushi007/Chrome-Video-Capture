import React, { useEffect, useState } from 'react';
import { RecordingEvents } from '../../common/util';

const ContentWrapper = () => {
  const [timeRemaining, setTimeRemaining] = useState(3);

  useEffect(() => {
    if (timeRemaining > 0) {
      const timerInterval = setInterval(() => {
        setTimeRemaining((prevTime) => prevTime - 1);
      }, 1000);

      return () => clearInterval(timerInterval);
    }
  }, [timeRemaining]);

  useEffect(() => {
    if (timeRemaining === 0) {
      chrome.runtime.sendMessage({
        type: RecordingEvents.startRecording,
      });
    }
  }, [timeRemaining]);

  return (
    <>
      {timeRemaining > 0 && (
        <div className="font-sans fixed inset-0 flex items-center justify-center border-4 border-[rgb(236,78,248)] bg-[#00000080] z-[2147483647]">
          <div className="text-9xl font-medium text-white">{timeRemaining}</div>
        </div>
      )}
    </>
  );
};

export default ContentWrapper;
