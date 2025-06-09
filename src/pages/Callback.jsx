import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const SERVER_URL = import.meta.env.VITE_SERVER_API_URL;
const REDIRECT_URI = 'https://cooronite-web.vercel.app/callback';

function Callback() {
    const location = useLocation();
    const query = new URLSearchParams(location.search);
    const code = query.get("code");

    useEffect(() => {
        const fetchLogin = async () => {
            const response = await fetch(SERVER_URL + "/api/auth/login", {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    code: code,
                    redirect_uri: REDIRECT_URI
                })
            });

            const { user } = await response.json();
            if (response.status === 200) {
                window.ReactNativeWebView?.postMessage(JSON.stringify({ userData: user }));
            } else {
                throw new Error("Login Error!!");
            }
        };

        if (code) fetchLogin();
    }, [code]);

    return <></>;
}

export default Callback;
