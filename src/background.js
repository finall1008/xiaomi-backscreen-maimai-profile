/* The bridge schedules refresh(); no Canvas or module-owned timers here. */
async function refresh() {
  var repository = globalThis.MaiProfile.createRepository(globalThis.bridge);
  var settings = await repository.getCardSettings();
  if (!settings.publicQq) return;
  await repository.refreshPublic();
  var profile = await repository.getProfile();
  var images = await repository.getImages(profile);
  await globalThis.bridge.card.saveSnapshot({ profile: profile, images: images });
}
