// PocketBase API wrapper
// PB SDK is loaded globally via CDN, so we use window.PocketBase
const pb = new PocketBase('https://base.heli0s.dev');

export { pb };

export const isSuperUser = () => {
  const model = pb.authStore.model;
  return model?.collectionName === '_superusers' || !model?.collectionId;
};
