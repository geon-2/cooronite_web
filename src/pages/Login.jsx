import {useEffect} from "react";

const SERVER_URL = import.meta.env.VITE_SERVER_API_URL

function Login() {
    useEffect(() => {
        fetch(SERVER_URL + "/api/auth/authorize", {
            method: "POST",
            header: {
                'Content-Type': 'application/json'
            },
            data: JSON.stringify({
                redirect_uri: 'https://cooronite-web.vercel.app/callback'
            })
        })
    }, []);

    return <></>
}

export default Login;