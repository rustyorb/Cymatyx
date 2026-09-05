import { useSignal } from '../../bus/useSignal';

/** Red tally = the camera is sampling. Never lit by anything but the bus. */
export function TallyLamp() {
  const live = useSignal('cam_live');
  const status = useSignal('cam_status');
  return (
    <span className="flex items-center gap-1.5" role="status" aria-label={live ? 'Camera live' : 'Camera off'} data-lit={String(live)}>
      <span className={`led ${live ? 'bg-red text-red animate-pulse' : 'led-off'}`} />
      <span className="label">CAM {live ? status : 'off'}</span>
    </span>
  );
}
