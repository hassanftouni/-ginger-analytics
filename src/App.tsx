import { AppLayout } from '@/components/layout/AppLayout'
import { findRoute, type RouteId } from '@/config/navigation'
import { useHashRoute } from '@/hooks/useHashRoute'
import { BranchesPage } from '@/pages/BranchesPage'
import { BrandPage } from '@/pages/BrandPage'
import { CustomersPage } from '@/pages/CustomersPage'
import { FeedbackPage } from '@/pages/FeedbackPage'
import { FoodyHistoryPage } from '@/pages/FoodyHistoryPage'
import { FoodyPage } from '@/pages/FoodyPage'
import { HistoryPage } from '@/pages/HistoryPage'
import { ImportPage } from '@/pages/ImportPage'
import { OverviewPage } from '@/pages/OverviewPage'
import { PlateHistoryPage } from '@/pages/PlateHistoryPage'
import { PlatePage } from '@/pages/PlatePage'
import { PlatformPage } from '@/pages/PlatformPage'
import { ProductsPage } from '@/pages/ProductsPage'
import { ReportsPage } from '@/pages/ReportsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { TotersPage } from '@/pages/TotersPage'
import { TotersHistoryPage } from '@/pages/TotersHistoryPage'
import { DataStoreProvider } from '@/state/DataStoreProvider'
import { FiltersProvider } from '@/state/FiltersProvider'
import { FoodyStoreProvider } from '@/state/FoodyStoreProvider'
import { PlateStoreProvider } from '@/state/PlateStoreProvider'
import { TotersStoreProvider } from '@/state/TotersStoreProvider'

function renderPage(id: RouteId) {
  switch (id) {
    case 'overview':
      return <OverviewPage />
    case 'brand-ginger-and-co':
      return <BrandPage key={id} brandId="ginger-and-co" />
    case 'brand-pertutti':
      return <BrandPage key={id} brandId="pertutti" />
    case 'platform-weevi':
      return <PlatformPage key={id} platformId="weevi" />
    case 'platform-toters':
      // Toters has its own analytics module, separate from the Weevi engine.
      return <TotersPage />
    case 'platform-foody':
      // Foody (Cyprus, EUR) has its own analytics module, separate from Weevi and Toters.
      return <FoodyPage />
    case 'platform-plate':
      // Plate reservations have their own module, separate from every sales source.
      return <PlatePage />
    case 'branches':
      return <BranchesPage />
    case 'products':
      return <ProductsPage />
    case 'customers':
      return <CustomersPage />
    case 'feedback':
      return <FeedbackPage />
    case 'reports':
      return <ReportsPage />
    case 'import':
      return <ImportPage />
    case 'history':
      return <HistoryPage />
    case 'toters-history':
      return <TotersHistoryPage />
    case 'foody-history':
      return <FoodyHistoryPage />
    case 'plate-history':
      return <PlateHistoryPage />
    case 'settings':
      return <SettingsPage />
  }
}

function App() {
  const route = findRoute(useHashRoute())
  return (
    <DataStoreProvider>
      <TotersStoreProvider>
        <FoodyStoreProvider>
          <PlateStoreProvider>
            <FiltersProvider>
              <AppLayout route={route}>{renderPage(route.id)}</AppLayout>
            </FiltersProvider>
          </PlateStoreProvider>
        </FoodyStoreProvider>
      </TotersStoreProvider>
    </DataStoreProvider>
  )
}

export default App
