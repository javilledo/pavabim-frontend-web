import apiClient from './client';
import type {
  DriveAuthUrlResponse,
  DriveOAuthMessageEventData,
} from '../types/api.types';

export const driveService = {
  async getAuthUrl(): Promise<DriveAuthUrlResponse> {
    const { data } = await apiClient.get<DriveAuthUrlResponse>('/drive/auth/url');
    return data;
  },

  async openDriveOAuthPopup(): Promise<{ email?: string }> {
    const { url } = await this.getAuthUrl();

    const width = 560;
    const height = 680;
    const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
    const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);

    const popup = window.open(
      url,
      'pavabim-google-drive-oauth',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`,
    );

    if (!popup) {
      throw new Error(
        'El navegador bloqueó la ventana emergente de Google Drive. Habilita las ventanas emergentes e inténtalo nuevamente.',
      );
    }

    return new Promise((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        window.removeEventListener('message', handleMessage);
        window.clearInterval(closedCheckTimer);
      };

      const handleMessage = (event: MessageEvent) => {
        const payload = event.data as Partial<DriveOAuthMessageEventData> | null;
        if (!payload || typeof payload !== 'object') return;

        if (payload.type === 'GOOGLE_DRIVE_CONNECTED') {
          settled = true;
          cleanup();
          resolve({ email: payload.email });
        } else if (payload.type === 'GOOGLE_DRIVE_ERROR') {
          settled = true;
          cleanup();
          reject(
            new Error(payload.error || 'No se pudo vincular Google Drive.'),
          );
        }
      };

      window.addEventListener('message', handleMessage);

      const closedCheckTimer = window.setInterval(() => {
        if (popup.closed && !settled) {
          settled = true;
          cleanup();
          reject(new Error('Ventana de autorización cerrada por el usuario.'));
        }
      }, 500);
    });
  },
};

export default driveService;

