import { useEffect, useState } from 'react';
import { bus } from '../../bus/store';
import { useSignal } from '../../bus/useSignal';
import { listCameras } from '../../sensor/camera';

/** Back-of-rack camera jack: which video input feeds the engine. Latched while a session runs. */
export function CameraSelect() {
  const device = useSignal('cam_device');
  const state = useSignal('session_state');
  const live = useSignal('cam_live');
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    let on = true;
    listCameras().then((c) => on && setCams(c));
    return () => {
      on = false;
    };
  }, [live]); // labels appear once permission has been granted
  return (
    <label className="block space-y-1">
      <span className="label" style={{ color: 'var(--color-nixie-dim)' }}>
        Camera input
      </span>
      <select
        className="jack-select"
        value={device ?? ''}
        disabled={state !== 'idle' && state !== 'summary'}
        onChange={(e) => bus.getState().set('cam_device', e.target.value || null)}
      >
        <option value="">default (browser)</option>
        {cams.map((c, i) => (
          <option key={c.deviceId || i} value={c.deviceId}>
            {c.label || `camera ${i + 1}`}
          </option>
        ))}
      </select>
    </label>
  );
}
