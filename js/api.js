// PocketBase API wrapper
// PB SDK is loaded globally via CDN, so we use window.PocketBase

// When served via Docker Compose (nginx proxy), use current origin.
// For standalone dev, fall back to the remote instance.
const PB_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? window.location.origin
  : 'https://base.heli0s.dev';

const pb = new PocketBase(PB_URL);

export { pb };

export const isSuperUser = () => {
  const model = pb.authStore.model;
  return model?.collectionName === '_superusers' || !model?.collectionId;
};
