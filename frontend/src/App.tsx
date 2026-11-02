import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import CifFormPage from './pages/CifFormPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/cif-form" replace />} />
        <Route path="/cif-form" element={<CifFormPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/cif-form" replace />} />
    </Routes>
  );
}
