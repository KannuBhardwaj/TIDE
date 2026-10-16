import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './index.css';
import { App } from './ui/App';
import { PhoneController } from './phone/PhoneController';

const router = createBrowserRouter([
  { path: '/', element: <App /> },
  { path: '/play/:room', element: <PhoneController /> },
  // track inspector lands here in M4
  { path: '/dev/tracks', element: <App /> },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
