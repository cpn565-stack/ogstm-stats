export default function PresenterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="-mx-4 -my-6 max-w-none sm:-mx-6 lg:-mx-8">{children}</div>;
}