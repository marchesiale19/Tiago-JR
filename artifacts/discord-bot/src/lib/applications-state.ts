let applicationsOpen = false;

export function areApplicationsOpen(): boolean {
  return applicationsOpen;
}

export function setApplicationsOpen(open: boolean): void {
  applicationsOpen = open;
}
