/** Reveal page content and remove the static boot splash once JS has started. */
export function handoffPageBoot(): void {
  document.body.classList.add('app-ready');
  document.getElementById('page-boot-splash')?.remove();
}
