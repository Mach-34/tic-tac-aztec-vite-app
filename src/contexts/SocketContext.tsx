import { createContext, useContext, useEffect, useState } from 'react';
import { Socket, io } from 'socket.io-client';

const { REACT_APP_API_URL: API_URL } = process.env;

type SocketContextType = Socket | null;

// Context creation
const SocketContext = createContext<SocketContextType>(null);

// Provider component that wraps your app or component tree
export const SocketProvider: React.FC<{ children: JSX.Element }> = ({
  children,
}) => {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    // Connect to Socket.IO server
    const socketIo = io(API_URL!);
    socketIo.connect();
    setSocket(socketIo);

    // Cleanup on component unmount
    return () => {
      socketIo.disconnect();
    };
  }, []);

  return (
    <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>
  );
};

export const useSocket = (): SocketContextType => useContext(SocketContext);
