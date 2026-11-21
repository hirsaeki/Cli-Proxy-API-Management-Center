import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Sheet } from '@/components/ui/Sheet';
import { apiClient } from '@/services/api/client';
import { vertexFailoverApi, type VertexFailoverMode } from '@/services/api/vertexFailover';
import {
  readVertexFailover,
  saveVertexFailover,
  type VertexFailoverState,
} from '../vertexFailover';

type Props = {
  name: string;
  authIndex?: string;
  disabled: boolean;
};

const loading: VertexFailoverState = { kind: 'loading' };

export function VertexFailoverControl({ name, authIndex, disabled }: Props) {
  const { t } = useTranslation();
  const [openRevision, setOpenRevision] = useState<number | null>(null);
  const [state, setState] = useState<VertexFailoverState>(loading);
  const [pending, setPending] = useState<VertexFailoverMode | null>(null);
  const [busy, setBusy] = useState(false);
  const session = useRef(0);
  const saving = useRef(false);
  const closing = useRef(false);
  const warningRef = useRef<HTMLParagraphElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const connectionRevision = apiClient.getConnectionRevision();
  const open = openRevision !== null && openRevision === connectionRevision;

  useEffect(
    () => () => {
      session.current += 1;
    },
    []
  );

  useEffect(() => {
    if (open && pending) warningRef.current?.focus();
  }, [open, pending]);

  const request = (revision: number, id: number) => {
    const isCurrent = () =>
      session.current === id && apiClient.getConnectionRevision() === revision;
    return {
      isCurrent,
      policyApi: vertexFailoverApi(apiClient.captureConnection(isCurrent), { name, authIndex }),
    };
  };

  const openAndLoad = () => {
    if (disabled) return;
    const id = ++session.current;
    const revision = apiClient.getConnectionRevision();
    const { isCurrent, policyApi } = request(revision, id);
    saving.current = false;
    closing.current = false;
    setBusy(false);
    setPending(null);
    setState(loading);
    setOpenRevision(revision);
    void readVertexFailover(policyApi.read).then((next) => {
      if (isCurrent()) setState(next);
    });
  };

  const beginClose = () => {
    if (saving.current || closing.current) return false;
    closing.current = true;
    session.current += 1;
    return true;
  };

  const cancelChange = () => {
    setPending(null);
    statusRef.current?.focus();
  };

  const confirm = async () => {
    if (
      disabled ||
      !open ||
      saving.current ||
      closing.current ||
      !pending ||
      state.kind !== 'ready'
    ) {
      return;
    }
    const { isCurrent, policyApi } = request(openRevision, session.current);
    if (!isCurrent()) return;
    saving.current = true;
    setBusy(true);
    const next = await saveVertexFailover(policyApi, state, pending, isCurrent);
    if (!isCurrent()) return;
    saving.current = false;
    setBusy(false);
    setPending(null);
    if (next) setState(next);
    statusRef.current?.focus();
  };

  const key = (suffix: string) => t(`auth_files.vertex_failover_${suffix}`);

  return (
    <>
      <Button variant="secondary" size="sm" onClick={openAndLoad} disabled={disabled}>
        {key('label')}
      </Button>
      <Sheet
        open={open}
        title={key('label')}
        onClose={() => setOpenRevision(null)}
        confirmClose={beginClose}
        closeDisabled={busy}
        footer={
          pending ? (
            <>
              <Button variant="secondary" onClick={cancelChange} disabled={busy}>
                {t('common.cancel')}
              </Button>
              <Button onClick={() => void confirm()} disabled={busy || disabled}>
                {busy ? <LoadingSpinner size={14} /> : t('common.confirm')}
              </Button>
            </>
          ) : state.kind === 'ready' ? (
            <>
              {state.policy.mode !== 'off' && (
                <Button variant="secondary" onClick={() => setPending('off')} disabled={disabled}>
                  {key('turn_off')}
                </Button>
              )}
              {state.policy.mode !== 'automatic' && (
                <Button onClick={() => setPending('automatic')} disabled={disabled}>
                  {key('turn_on')}
                </Button>
              )}
            </>
          ) : state.kind === 'read_error' || state.kind === 'unknown' ? (
            <Button variant="secondary" onClick={openAndLoad} disabled={disabled}>
              {key('read_again')}
            </Button>
          ) : null
        }
      >
        <p>{name}</p>
        {state.kind === 'loading' && (
          <p role="status">
            <LoadingSpinner size={16} /> {t('common.loading')}
          </p>
        )}
        {state.kind !== 'loading' && state.kind !== 'ready' && (
          <p role="status">{key(state.kind)}</p>
        )}
        {state.kind === 'ready' && (
          <>
            <p role="status" tabIndex={-1} ref={statusRef}>
              {key(state.policy.mode)}
            </p>
            {state.writeUnconfirmed && <p role="alert">{key('write_unconfirmed')}</p>}
            {pending && (
              <p role="alert" tabIndex={-1} ref={warningRef}>
                {key(pending === 'automatic' ? 'enable_warning' : 'disable_warning')}
              </p>
            )}
          </>
        )}
      </Sheet>
    </>
  );
}
