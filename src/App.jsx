import { BrowserRouter, Routes, Route } from "react-router-dom";
import Map from './pages/Map'
import Login from './pages/Login';
import Callback from './pages/Callback'
import Location from './pages/Location'
import Crawling from "./pages/Crawling.jsx";

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Map />} />
                <Route path="/login" element={<Login />} />
                <Route path="/callback" element={<Callback />} />
                <Route path="/location" element={<Location />} />
                <Route path="/crawling" element={<Crawling />} />
            </Routes>
        </BrowserRouter>
    )
}

export default App;