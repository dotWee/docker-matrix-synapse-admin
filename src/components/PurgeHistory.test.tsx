import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { buttonMock, notifyMock, recordContextMock, simpleFormMock, useDataProviderMock } = vi.hoisted(() => ({
  buttonMock: vi.fn(({ label, onClick, disabled, children }: any) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {label}
      {children}
    </button>
  )),
  notifyMock: vi.fn(),
  recordContextMock: vi.fn(),
  simpleFormMock: vi.fn(({ onSubmit, toolbar, children }: any) => (
    <form
      onSubmit={event => {
        event.preventDefault();
        onSubmit({ purge_up_to_ts: 1685000000000, delete_local_events: true });
      }}
    >
      {children}
      {toolbar}
      <button type="submit">submit-form</button>
    </form>
  )),
  useDataProviderMock: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useMutation: ({ mutationFn, onSuccess, onError }: any) => ({
    isPending: false,
    mutate: async (data: unknown) => {
      try {
        const result = await mutationFn(data);
        onSuccess?.(result);
      } catch (error) {
        onError?.(error);
      }
    },
  }),
}));

vi.mock("@mui/material", () => ({
  CircularProgress: () => <span data-testid="loading-spinner">loading</span>,
  Dialog: ({ open, children }: any) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogContentText: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
  Typography: ({ children, color }: any) => (
    <span data-testid="status-text" data-color={color}>
      {children}
    </span>
  ),
}));

vi.mock("@mui/material/styles", () => ({
  alpha: () => "hover",
  useTheme: () => ({
    palette: {
      error: { main: "#f00" },
    },
  }),
}));

vi.mock("@mui/icons-material/Cancel", () => ({ default: () => <span>cancel-icon</span> }));
vi.mock("@mui/icons-material/DeleteSweep", () => ({ default: () => <span>delete-sweep-icon</span> }));

vi.mock("react-admin", () => ({
  BooleanInput: ({ label }: any) => <div>{label}</div>,
  Button: buttonMock,
  DateTimeInput: ({ label }: any) => <div>{label}</div>,
  SaveButton: ({ label }: any) => <button type="button">{label}</button>,
  SimpleForm: simpleFormMock,
  Toolbar: ({ children }: any) => <div>{children}</div>,
  useDataProvider: useDataProviderMock,
  useNotify: () => notifyMock,
  useRecordContext: recordContextMock,
  useTranslate: () => (key: string) => key,
}));

import { PurgeHistoryButton } from "./PurgeHistory";

describe("PurgeHistoryButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    recordContextMock.mockReturnValue({ id: "!room:example.com", name: "Lobby" });
    useDataProviderMock.mockReturnValue({
      purgeHistory: vi.fn().mockResolvedValue({ purge_id: "purge-123" }),
      getPurgeStatus: vi.fn().mockResolvedValue({ status: "complete" }),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null when there is no record context", () => {
    recordContextMock.mockReturnValue(undefined);

    const { container } = render(<PurgeHistoryButton />);

    expect(container.innerHTML).toBe("");
  });

  it("renders the purge history button", () => {
    render(<PurgeHistoryButton />);

    expect(
      screen.getByRole("button", { name: "resources.rooms.action.purge_history.title delete-sweep-icon" })
    ).toBeTruthy();
  });

  it("opens the dialog when the button is clicked", () => {
    render(<PurgeHistoryButton />);

    expect(screen.queryByTestId("dialog")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "resources.rooms.action.purge_history.title delete-sweep-icon" })
    );
    expect(screen.getByTestId("dialog")).toBeTruthy();
  });

  it("renders dialog form fields and toolbar", () => {
    render(<PurgeHistoryButton />);

    fireEvent.click(
      screen.getByRole("button", { name: "resources.rooms.action.purge_history.title delete-sweep-icon" })
    );

    // Title appears twice: once on the button, once in the dialog header
    expect(screen.getAllByText("resources.rooms.action.purge_history.title")).toHaveLength(2);
    expect(screen.getByText("resources.rooms.action.purge_history.helper")).toBeTruthy();
    expect(screen.getByText("resources.rooms.action.purge_history.fields.purge_up_to_ts")).toBeTruthy();
    expect(screen.getByText("resources.rooms.action.purge_history.fields.delete_local_events")).toBeTruthy();
    expect(screen.getByText("resources.rooms.action.purge_history.action")).toBeTruthy();
    expect(screen.getByText("ra.action.cancel")).toBeTruthy();
  });

  it("submits the purge history request and starts polling", async () => {
    const purgeHistoryMock = vi.fn().mockResolvedValue({ purge_id: "purge-123" });
    const getPurgeStatusMock = vi.fn().mockResolvedValue({ status: "complete" });
    useDataProviderMock.mockReturnValue({
      purgeHistory: purgeHistoryMock,
      getPurgeStatus: getPurgeStatusMock,
    });

    render(<PurgeHistoryButton />);

    fireEvent.click(
      screen.getByRole("button", { name: "resources.rooms.action.purge_history.title delete-sweep-icon" })
    );
    fireEvent.click(screen.getByRole("button", { name: "submit-form" }));

    await waitFor(() =>
      expect(purgeHistoryMock).toHaveBeenCalledWith({
        room_id: "!room:example.com",
        purge_up_to_ts: 1685000000000,
        delete_local_events: true,
      })
    );

    expect(notifyMock).toHaveBeenCalledWith("resources.rooms.action.purge_history.started");

    // Advance timer to trigger polling
    await vi.advanceTimersByTimeAsync(2000);

    await waitFor(() => expect(getPurgeStatusMock).toHaveBeenCalledWith("purge-123"));
    await waitFor(() => expect(notifyMock).toHaveBeenCalledWith("resources.rooms.action.purge_history.success"));
  });

  it("notifies on failure when the purge request itself fails", async () => {
    const purgeHistoryMock = vi.fn().mockRejectedValue(new Error("boom"));
    useDataProviderMock.mockReturnValue({
      purgeHistory: purgeHistoryMock,
      getPurgeStatus: vi.fn(),
    });

    render(<PurgeHistoryButton />);

    fireEvent.click(
      screen.getByRole("button", { name: "resources.rooms.action.purge_history.title delete-sweep-icon" })
    );
    fireEvent.click(screen.getByRole("button", { name: "submit-form" }));

    await waitFor(() =>
      expect(notifyMock).toHaveBeenCalledWith("resources.rooms.action.purge_history.failure", { type: "error" })
    );
  });

  it("notifies on failure when purge status polling returns failed", async () => {
    const purgeHistoryMock = vi.fn().mockResolvedValue({ purge_id: "purge-fail" });
    const getPurgeStatusMock = vi.fn().mockResolvedValue({ status: "failed", error: "Something broke" });
    useDataProviderMock.mockReturnValue({
      purgeHistory: purgeHistoryMock,
      getPurgeStatus: getPurgeStatusMock,
    });

    render(<PurgeHistoryButton />);

    fireEvent.click(
      screen.getByRole("button", { name: "resources.rooms.action.purge_history.title delete-sweep-icon" })
    );
    fireEvent.click(screen.getByRole("button", { name: "submit-form" }));

    await waitFor(() => expect(notifyMock).toHaveBeenCalledWith("resources.rooms.action.purge_history.started"));

    await vi.advanceTimersByTimeAsync(2000);

    await waitFor(() => expect(getPurgeStatusMock).toHaveBeenCalledWith("purge-fail"));
    await waitFor(() =>
      expect(notifyMock).toHaveBeenCalledWith("resources.rooms.action.purge_history.failure", { type: "error" })
    );
  });

  it("notifies on failure when purge status polling throws an error", async () => {
    const purgeHistoryMock = vi.fn().mockResolvedValue({ purge_id: "purge-err" });
    const getPurgeStatusMock = vi.fn().mockRejectedValue(new Error("network error"));
    useDataProviderMock.mockReturnValue({
      purgeHistory: purgeHistoryMock,
      getPurgeStatus: getPurgeStatusMock,
    });

    render(<PurgeHistoryButton />);

    fireEvent.click(
      screen.getByRole("button", { name: "resources.rooms.action.purge_history.title delete-sweep-icon" })
    );
    fireEvent.click(screen.getByRole("button", { name: "submit-form" }));

    await waitFor(() => expect(notifyMock).toHaveBeenCalledWith("resources.rooms.action.purge_history.started"));

    await vi.advanceTimersByTimeAsync(2000);

    await waitFor(() =>
      expect(notifyMock).toHaveBeenCalledWith("resources.rooms.action.purge_history.failure", { type: "error" })
    );
  });

  it("closes the dialog and stops polling when cancel is clicked", async () => {
    const purgeHistoryMock = vi.fn().mockResolvedValue({ purge_id: "purge-cancel" });
    const getPurgeStatusMock = vi.fn().mockResolvedValue({ status: "active" });
    useDataProviderMock.mockReturnValue({
      purgeHistory: purgeHistoryMock,
      getPurgeStatus: getPurgeStatusMock,
    });

    render(<PurgeHistoryButton />);

    // Open dialog and submit
    fireEvent.click(
      screen.getByRole("button", { name: "resources.rooms.action.purge_history.title delete-sweep-icon" })
    );
    fireEvent.click(screen.getByRole("button", { name: "submit-form" }));

    await waitFor(() => expect(notifyMock).toHaveBeenCalledWith("resources.rooms.action.purge_history.started"));

    // Close dialog (cancel button) - rendered by the Toolbar inside SimpleForm
    fireEvent.click(screen.getByRole("button", { name: /ra\.action\.cancel/ }));

    expect(screen.queryByTestId("dialog")).toBeNull();

    // Verify that polling stops: advance past the interval and confirm no further calls
    getPurgeStatusMock.mockClear();
    await vi.advanceTimersByTimeAsync(4000);

    expect(getPurgeStatusMock).not.toHaveBeenCalled();
  });
});
