import React from 'react';
import { createRoot } from 'react-dom/client';
import { Auth0Provider } from '@auth0/auth0-react';

import Popup from './Popup';
import './index.css';
import secrets from 'secrets';

const container = document.getElementById('app-container');
const root = createRoot(container); // createRoot(container!) if you use TypeScript
root.render(
  <Auth0Provider
    domain={secrets.AUTH0_DOMAIN}
    clientId={secrets.AUTH0_CLIENT_ID}
    authorizationParams={{
      audience: secrets.AUTH0_AUDIENCE,
      redirect_uri: window.location.origin,
    }}
  >
    <Popup />
  </Auth0Provider>
);
