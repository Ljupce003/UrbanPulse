import {Routes, Route, Navigate, useLocation} from 'react-router-dom'
import {useAuth} from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Navbar from './components/Navbar'
import Login from './pages/Login'
import AuthCallback from './pages/AuthCallback'
import Home from './pages/Home'
import Profile from './pages/Profile'
import UserManagement from "./pages/ManageUsers.jsx";
import Analyzer from './pages/Analyzer' // update Analyzer.jsx component when ready
import DataManagement from './pages/DataManagement'
import Recommendations from './pages/Recommendations'
import Status from './pages/Status'
import Simulator from './pages/Simulator'

const HIDDEN_NAV = ['/login', '/auth/callback']

function Layout({children}) {
    const location = useLocation()
    const {user} = useAuth()
    const showNav = user && !HIDDEN_NAV.includes(location.pathname)

    return (
        <>
            {showNav && <Navbar/>}
            {children}
        </>
    )
}

export default function App() {
    return (
        <Layout>
            <Routes>
                <Route path="/login" element={<Login/>}/>
                <Route path="/auth/callback" element={<AuthCallback/>}/>

                <Route path="/" element={
                    <ProtectedRoute><Home/></ProtectedRoute>
                }/>
                <Route path="/profile" element={
                    <ProtectedRoute><Profile/></ProtectedRoute>
                }/>
                <Route path="/admin/users" element={
                    <ProtectedRoute><UserManagement/></ProtectedRoute>
                }/>
                <Route path="/analyzer" element={
                    <ProtectedRoute><Analyzer/></ProtectedRoute>
                }/>
                <Route path="/recommendations" element={
                    <ProtectedRoute><Recommendations/></ProtectedRoute>
                }/>
                <Route path="/status" element={
                    <ProtectedRoute allowedRoles={['admin']}>
                        <Status/>
                    </ProtectedRoute>
                }/>
                <Route path="/simulate" element={
                    <ProtectedRoute><Simulator/></ProtectedRoute>
                }/>


                <Route path="/data" element={
                    <ProtectedRoute allowedRoles={['analyst', 'admin']}>
                        <DataManagement/>
                    </ProtectedRoute>
                }/>

                <Route path="*" element={<Navigate to="/" replace/>}/>
            </Routes>
        </Layout>
    )
}