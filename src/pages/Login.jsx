import {useEffect} from "react";

const SERVER_URL = import.meta.env.VITE_SERVER_API_URL
const REDIRECT_URI = 'https://cooronite-web.vercel.app/callback'

function Login() {
    useEffect(() => {
        window.location.href = SERVER_URL + "/api/auth/authorize?redirect_uri=" + REDIRECT_URI
    }, []);

    return <></>
}

export default Login;