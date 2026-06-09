import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material';
import {
  usePairingApproveMutation,
  usePairingCheckMutation,
  usePairingStartMutation,
} from '../api';

type Props = {
  onPaired: () => void;
};

export default function PairingPanel({ onPaired }: Props) {
  const [startPairing, { isLoading: starting }] = usePairingStartMutation();
  const [checkPairing] = usePairingCheckMutation();
  const [approvePairing] = usePairingApproveMutation();
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [instructions, setInstructions] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  const runCheck = useCallback(async () => {
    try {
      const res = await checkPairing().unwrap();
      if (res.status === 'paired') {
        setPolling(false);
        onPaired();
      }
    } catch {
      /* ignore */
    }
  }, [checkPairing, onPaired]);

  useEffect(() => {
    if (!polling) return undefined;
    const id = window.setInterval(runCheck, 2000);
    return () => window.clearInterval(id);
  }, [polling, runCheck]);

  const handleStart = async () => {
    setError(null);
    try {
      const res = await startPairing().unwrap();
      if (res.status === 'paired') {
        onPaired();
        return;
      }
      if (res.status === 'pairing_pending' && res.pairingCode) {
        setPairingCode(res.pairingCode);
        setInstructions(res.instructions ?? null);
        await approvePairing({ pairingCode: res.pairingCode }).unwrap();
        setPolling(true);
        return;
      }
      setError(res.status);
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <Box data-testid="pairing-panel" sx={{ p: 3, maxWidth: 480 }}>
      <Typography variant="h6" gutterBottom>
        Parear com OpenClaw (clawg-ui)
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        O chat CopilotKit precisa de pareamento com o plugin clawg-ui antes do primeiro uso.
      </Typography>
      {pairingCode && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Código: <strong>{pairingCode}</strong>
          {instructions && (
            <Typography variant="caption" display="block" sx={{ mt: 1 }}>
              {instructions}
            </Typography>
          )}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Button variant="contained" onClick={handleStart} disabled={starting || polling}>
        {starting || polling ? <CircularProgress size={20} /> : 'Iniciar pareamento'}
      </Button>
    </Box>
  );
}
