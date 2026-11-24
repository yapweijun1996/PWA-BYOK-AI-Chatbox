export const formatSize = (size: number) =>
  size >= 1048576
    ? `${(size / 1048576).toFixed(1)} MB`
    : `${(size / 1024).toFixed(1)} KB`;
