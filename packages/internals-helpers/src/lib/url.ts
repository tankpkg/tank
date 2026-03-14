export function encodeSkillName(name: string): string {
  return encodeURIComponent(name).replace(/%40/g, '@').replace(/%2F/gi, '/');
}
