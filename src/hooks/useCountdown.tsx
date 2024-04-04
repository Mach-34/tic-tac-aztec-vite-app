import { useState, useEffect } from 'react';

export type Countdown = {
  minutes: string;
  seconds: string;
};

const useCountdown = (expiry: number) => {
  const expiryMilli = expiry * 1000;
  const [countdown, setCountdown] = useState<Countdown>(
    calculateCountdown(expiryMilli)
  );

  useEffect(() => {
    let interval: NodeJS.Timeout | undefined = undefined;
    if (expiry > 0) {
      interval = setInterval(() => {
        const newCountdown = calculateCountdown(expiryMilli);
        if (newCountdown.minutes === '0' && newCountdown.seconds === '00') {
          setCountdown(newCountdown);
          clearInterval(interval);
        } else {
          setCountdown(newCountdown);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [expiry]);

  return countdown;
};

const calculateCountdown = (expiry: number) => {
  const currentTime = new Date().getTime();
  const difference = expiry - currentTime;
  const remainingTime = Math.min(difference, expiry);
  let timeLeft = { minutes: '0', seconds: '00' };

  const minutes = Math.floor(remainingTime / (1000 * 60));
  const seconds = Math.floor((remainingTime / 1000) % 60);

  if (remainingTime > 0) {
    timeLeft = {
      minutes: minutes.toString(),
      seconds: seconds < 10 ? `0${seconds}` : seconds.toString(),
    };
  }
  return timeLeft;
};

export default useCountdown;
