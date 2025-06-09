import {useEffect} from "react";
import { useLocation } from "react-router-dom";

function Callback() {
    const location = useLocation();
    const code = location.code;

    useEffect(() => {

    }, []);

    return <></>
}

export default Callback;