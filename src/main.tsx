import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './index.css';
import { ArenaScreen } from './ui/ArenaScreen';

const router = createBrowserRouter([
  { path: '/', element: <ArenaScreen /> },
  // phone controller + dev routes land here in later milestones
  { path: '/play/:room', element: <ArenaScreen /> },
  { path: '/dev/tracks', element: <ArenaScreen /> },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
