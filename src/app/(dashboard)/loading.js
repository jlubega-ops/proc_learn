/**
 * Immediate feedback while App Router soft-navigates between signed-in pages.
 */
export default function DashboardLoading() {
  return (
    <div
      className="flex min-h-[40vh] w-full items-center justify-center py-12"
      role="status"
      aria-busy="true"
      aria-label="Loading page"
    >
      <div
        className="h-9 w-9 animate-spin rounded-full border-2 border-primary border-t-transparent"
        aria-hidden
      />
    </div>
  );
}
