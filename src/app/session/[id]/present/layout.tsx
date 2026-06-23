export default function PresenterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="-mx-4 -my-6 sm:-mx-6 lg:-mx-8">{children}</div>;
}