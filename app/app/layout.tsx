import BottomTabBar from '@/components/BottomTabBar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-column pb-20">
      {children}
      <BottomTabBar />
    </div>
  )
}
