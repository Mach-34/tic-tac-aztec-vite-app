import { useState, useEffect } from 'react';

const useCountdown = (expiry: number) => {
  const expiryMilli = expiry * 1000;
  const [countdown, setCountdown] = useState(calculateCountdown(expiryMilli));

  useEffect(() => {
    let interval: NodeJS.Timeout | undefined = undefined;
    if (expiry > 0) {
      interval = setInterval(() => {
        const newCountdown = calculateCountdown(expiryMilli);
        if (newCountdown.minutes === 0 && newCountdown.seconds === 0) {
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
  let timeLeft = { minutes: 0, seconds: 0 };

  if (remainingTime > 0) {
    timeLeft = {
      minutes: Math.floor(remainingTime / (1000 * 60)),
      seconds: Math.floor((remainingTime / 1000) % 60),
    };
  }
  return timeLeft;
};

export default useCountdown;
