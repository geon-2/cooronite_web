import { BrowserRouter, Routes, Route } from "react-router-dom";
import Map from './pages/Map'
import Login from './pages/Login';
import Callback from './pages/Callback'
import Location from './pages/Location'

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Map />} />
                <Route path="/login" element={<Login />} />
                <Route path="/callback" element={<Callback />} />
                <Route path="/location" element={<Location />} />
            </Routes>
        </BrowserRouter>
    )
}

export default App;