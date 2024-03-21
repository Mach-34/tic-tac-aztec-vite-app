import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from 'react-router-dom';
import Lobby from 'views/Lobby';
import Game from 'views/Game';
import NotFound from 'views/NotFound';
import { ToastContainer } from 'react-toastify';
import { UserProvider } from 'contexts/UserContext';
import { SocketProvider } from 'contexts/SocketContext';

function App() {
  const router = createBrowserRouter([
    {
      path: '/',
      element: <Navigate to='/lobby' />,
    },
    {
      path: '/lobby',
      element: <Lobby />,
    },
    {
      path: '/game/:gameId',
      element: <Game />,
    },
    {
      path: '*',
      element: <NotFound />,
    },
  ]);

  return (
    <div>
      <ToastContainer position='top-center' theme='colored' />
      <SocketProvider>
        <UserProvider>
          <RouterProvider router={router} />
        </UserProvider>
      </SocketProvider>
    </div>
  );
}

export default App;
