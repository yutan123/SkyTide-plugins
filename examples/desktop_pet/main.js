let taps = 0;

tide.on('ui.action', async ({action}, ui) => {
  if (action === 'open') {
    taps = 0;
    await ui.overlay.show({entry: 'pet.html', assetPaths: ['pet.svg'], width: 112, height: 112, compact: true});
  } else if (action === 'close') {
    await tide.overlay.close();
  }
});

tide.on('overlay.message', async ({data}) => {
  if (data?.type === 'pet') await tide.overlay.update({taps: ++taps});
});