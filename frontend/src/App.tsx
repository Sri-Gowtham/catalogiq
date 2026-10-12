import { lazy } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { useRouteTitle } from '@/lib/title'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { Contact, Login, Signup } from '@/pages/public/Auth'
import { Landing } from '@/pages/public/Landing'
import { Onboarding } from '@/pages/public/Onboarding'

const Reports = lazy(() => import('@/pages/app/Admin').then((m) => ({ default: m.Reports })))
const Settings = lazy(() => import('@/pages/app/Admin').then((m) => ({ default: m.Settings })))
const BatchDetail = lazy(() => import('@/pages/app/Batches').then((m) => ({ default: m.BatchDetail })))
const Batches = lazy(() => import('@/pages/app/Batches').then((m) => ({ default: m.Batches })))
const Catalog = lazy(() => import('@/pages/app/Catalog').then((m) => ({ default: m.Catalog })))
const Performance = lazy(() => import('@/pages/app/Performance').then((m) => ({ default: m.Performance })))
const Publishing = lazy(() => import('@/pages/app/Publishing').then((m) => ({ default: m.Publishing })))
const Rules = lazy(() => import('@/pages/app/Rules').then((m) => ({ default: m.Rules })))
const Workbench = lazy(() => import('@/pages/app/Workbench').then((m) => ({ default: m.Workbench })))
const Overview = lazy(() => import('@/pages/app/Overview').then((m) => ({ default: m.Overview })))
const Platforms = lazy(() => import('@/pages/app/Platforms').then((m) => ({ default: m.Platforms })))
const Product = lazy(() => import('@/pages/app/Product').then((m) => ({ default: m.Product })))
const Review = lazy(() => import('@/pages/app/Review').then((m) => ({ default: m.Review })))

export default function App() {
  useRouteTitle()
  return (
    <Routes>
      <Route index element={<Landing />} />
      <Route path="login" element={<Login />} />
      <Route path="signup" element={<Signup />} />
      <Route path="contact" element={<Contact />} />
      <Route path="onboarding" element={<Onboarding />} />
      <Route path="app" element={<AppShell />}>
        <Route index element={<Overview />} />
        <Route path="catalog" element={<Catalog />} />
        <Route path="products/:id" element={<Product />} />
        <Route path="batches" element={<Batches />} />
        <Route path="batches/:id" element={<BatchDetail />} />
        <Route path="review" element={<Review />} />
        <Route path="platforms" element={<Platforms />} />
        <Route path="publishing" element={<Publishing />} />
        <Route path="performance" element={<Performance />} />
        <Route path="rules" element={<Rules />} />
        <Route path="workbench" element={<Workbench />} />
        <Route path="reports" element={<Reports />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
