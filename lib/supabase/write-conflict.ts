export function retryableWriteError(code: string) {
  if (["55P03", "40P01", "40001"].includes(code)) {
    return "Another operation is updating saved data. Wait a moment, then try again.";
  }
  return null;
}
