import { useEffect, useRef, useState } from "react";

import IconCancel from "@mui/icons-material/Cancel";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import { CircularProgress, Dialog, DialogContent, DialogContentText, DialogTitle, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import {
  BooleanInput,
  Button,
  DateTimeInput,
  DateTimeInputProps,
  RaRecord,
  SaveButton,
  SimpleForm,
  Toolbar,
  ToolbarProps,
  useDataProvider,
  useNotify,
  useRecordContext,
  useTranslate,
} from "react-admin";
import { useMutation } from "@tanstack/react-query";

import { dateFormatter, dateParser } from "./date";
import { PurgeHistoryParams, PurgeHistoryStatus, SynapseDataProvider } from "../synapse/dataProvider";

const localDateTimeInputProps: Pick<DateTimeInputProps, "format" | "parse"> = {
  format: dateFormatter,
  parse: dateParser,
};

interface PurgeHistoryFormValues {
  purge_up_to_ts: number;
  delete_local_events: boolean;
}

const PurgeHistoryDialog = ({
  open,
  onClose,
  onSubmit,
  purgeStatus,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: PurgeHistoryFormValues) => void;
  purgeStatus: PurgeHistoryStatus | null;
}) => {
  const translate = useTranslate();

  const PurgeHistoryToolbar = (props: ToolbarProps) => (
    <Toolbar {...props}>
      <SaveButton label="resources.rooms.action.purge_history.action" icon={<DeleteSweepIcon />} />
      <Button label="ra.action.cancel" onClick={onClose}>
        <IconCancel />
      </Button>
    </Toolbar>
  );

  const isActive = purgeStatus?.status === "active";

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{translate("resources.rooms.action.purge_history.title")}</DialogTitle>
      <DialogContent>
        <DialogContentText>{translate("resources.rooms.action.purge_history.helper")}</DialogContentText>
        {purgeStatus && (
          <Typography
            variant="body2"
            sx={{ mt: 1, mb: 1 }}
            color={
              purgeStatus.status === "complete"
                ? "success.main"
                : purgeStatus.status === "failed"
                  ? "error.main"
                  : "info.main"
            }
          >
            {translate(`resources.rooms.action.purge_history.status.${purgeStatus.status}`)}
            {purgeStatus.error && `: ${purgeStatus.error}`}
          </Typography>
        )}
        {isActive && <CircularProgress size={20} sx={{ mb: 1 }} />}
        <SimpleForm toolbar={<PurgeHistoryToolbar />} onSubmit={onSubmit as (values: Partial<RaRecord>) => void}>
          <DateTimeInput
            source="purge_up_to_ts"
            label="resources.rooms.action.purge_history.fields.purge_up_to_ts"
            defaultValue={0}
            {...localDateTimeInputProps}
          />
          <BooleanInput
            source="delete_local_events"
            label="resources.rooms.action.purge_history.fields.delete_local_events"
            defaultValue={false}
          />
        </SimpleForm>
      </DialogContent>
    </Dialog>
  );
};

const POLL_INTERVAL_MS = 2000;

export const PurgeHistoryButton = () => {
  const theme = useTheme();
  const record = useRecordContext();
  const [open, setOpen] = useState(false);
  const [purgeStatus, setPurgeStatus] = useState<PurgeHistoryStatus | null>(null);
  const notify = useNotify();
  const dataProvider = useDataProvider<SynapseDataProvider>();
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  useEffect(() => {
    return () => stopPolling();
  }, []);

  const pollPurgeStatus = (purgeId: string) => {
    pollingRef.current = setInterval(async () => {
      try {
        const status = await dataProvider.getPurgeStatus(purgeId);
        setPurgeStatus(status);

        if (status.status === "complete") {
          stopPolling();
          notify("resources.rooms.action.purge_history.success");
        } else if (status.status === "failed") {
          stopPolling();
          notify("resources.rooms.action.purge_history.failure", { type: "error" });
        }
      } catch {
        stopPolling();
        notify("resources.rooms.action.purge_history.failure", { type: "error" });
      }
    }, POLL_INTERVAL_MS);
  };

  const { mutate: purgeHistory, isPending } = useMutation({
    mutationFn: (values: PurgeHistoryFormValues) => {
      if (!record) {
        return Promise.reject(new Error("No room record"));
      }

      const params: PurgeHistoryParams = {
        room_id: record.id as string,
        purge_up_to_ts: values.purge_up_to_ts,
        delete_local_events: values.delete_local_events,
      };

      return dataProvider.purgeHistory(params);
    },
    onSuccess: result => {
      setPurgeStatus({ status: "active" });
      notify("resources.rooms.action.purge_history.started");
      pollPurgeStatus(result.purge_id);
    },
    onError: () => {
      notify("resources.rooms.action.purge_history.failure", { type: "error" });
    },
  });

  if (!record) {
    return null;
  }

  const openDialog = () => {
    setPurgeStatus(null);
    setOpen(true);
  };
  const closeDialog = () => {
    setOpen(false);
    stopPolling();
  };

  return (
    <>
      <Button
        label="resources.rooms.action.purge_history.title"
        onClick={openDialog}
        disabled={isPending}
        sx={{
          color: theme.palette.error.main,
          "&:hover": {
            backgroundColor: alpha(theme.palette.error.main, 0.12),
            "@media (hover: none)": {
              backgroundColor: "transparent",
            },
          },
        }}
      >
        <DeleteSweepIcon />
      </Button>
      <PurgeHistoryDialog open={open} onClose={closeDialog} onSubmit={purgeHistory} purgeStatus={purgeStatus} />
    </>
  );
};
