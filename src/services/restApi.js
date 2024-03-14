import {
  BadRequestError,
  ForbiddenError,
  InternalServerError,
  NotFoundError,
} from '../../utils/errorTypes';

export const fetchWrapper = (arg1, url, body, additionalOptions) => {
  // if called with one argument, default to 'GET' method
  const _method = url ? arg1.toUpperCase() : 'GET';
  // if called without method arg, the first
  const _url = url || arg1;
  const options = {
    method: _method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${chrome.storage.local.get('token')}`,
    },
    body: body && JSON.stringify(body), // body can be undefined, that's ok
    ...additionalOptions,
  };

  return fetch(_url, options).then(handleResponse);
};

export const handleResponse = async (response) => {
  if (response.status === 401) {
    chrome.storage.local.remove('token');
  }

  if (response.status === 504) {
    throw new NotFoundError('Timeout: Request failed to complete in time.');
  }

  const res = await response.json();

  if (response.status === 500) {
    throw new InternalServerError(res.message);
  }

  if (response.status === 400) {
    throw new BadRequestError(res.message);
  }

  if (response.status === 403) {
    throw new ForbiddenError(res.message);
  }

  if (response.status === 404) {
    throw new NotFoundError(res.message);
  }

  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `There has been an error. Response status: ${response.status}`
    );
  }

  return res;
};
