import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './index.css';
import { App } from './ui/App';
import { PhoneController } from './phone/PhoneController';
import { TrackInspector } from './dev/TrackInspector';

const router = createBrowserRouter([
  { path: '/', element: <App /> },
  { path: '/play/:room', element: <PhoneController /> },
  { path: '/dev/tracks', element: <TrackInspector /> },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
