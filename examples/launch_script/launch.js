function draw({width, height, progress, dark, images}) {
  const tau = Math.PI * 2;
  const scale = Math.min(width, height);
  const x = width * (0.5 + 0.23 * Math.sin(tau * progress - 0.9));
  const y = height * (0.62 - 0.27 * progress + 0.06 * Math.cos(tau * progress));
  const fade = Math.min(1, progress * 8, (1 - progress) * 5);
  const ink = dark ? 0x95e9ff : 0x3466bb;
  const tint = alpha => (Math.round(alpha * 255) * 0x1000000) + ink;
  const commands = [
    ['linear', 0, 0, 0, height, dark ? 0xff070d24 : 0xffdaeaff,
      dark ? 0xff112a42 : 0xfff7f5ff],
    ['glow', x, y, scale * 0.44, tint(fade * 0.4), tint(0)],
  ];

  for (let i = 0; i < 32; i++) {
    const angle = i * 2.399963 + progress * 1.4;
    const distance = scale * (0.14 + (i % 11) * 0.026 + progress * 0.12);
    const px = x + Math.cos(angle) * distance;
    const py = y + Math.sin(angle) * distance * 0.64;
    const pulse = 0.35 + 0.55 * Math.abs(Math.sin(angle + tau * progress));
    commands.push(['circle', px, py, 0.8 + i % 3, tint(fade * pulse)]);
  }

  for (let i = 0; i < 3; i++) {
    const phase = (progress * 2.3 + i / 3) % 1;
    commands.push(['ring', x, y, scale * (0.08 + phase * 0.24),
      tint(fade * (1 - phase) * 0.28), 1.2]);
  }

  const w = scale * (0.22 + 0.026 * Math.sin(tau * progress * 3));
  const h = w * images.star.height / images.star.width;
  commands.push(['image', 'star', x - w / 2, y - h / 2, w, h, fade,
    Math.sin(tau * progress) * 0.32]);
  return commands;
}
