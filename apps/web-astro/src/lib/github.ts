import axios from 'axios';

import { GITHUB_REPO } from '~/consts';

export async function getStarCount(): Promise<number | null> {
  try {
    const { data } = await axios.get(`https://api.github.com/repos/${GITHUB_REPO}`, {
      headers: { Accept: 'application/vnd.github.v3+json' },
      timeout: 5000
    });
    return typeof data.stargazers_count === 'number' ? data.stargazers_count : null;
  } catch {
    return null;
  }
}
