// PocketBase API wrapper
// PB SDK is loaded globally via CDN, so we use window.PocketBase

// Always use current origin — PocketBase is proxied via nginx at /api/
const PB_URL = window.location.origin;

const pb = new PocketBase(PB_URL);

export { pb };

export const isSuperUser = () => {
  const model = pb.authStore.model;
  return model?.collectionName === '_superusers' || !model?.collectionId;
};
