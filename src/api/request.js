/**
 * HTTP 请求封装层
 *
 * 基于 Axios 创建多个实例，分别用于：
 *   - api:           普通业务接口（带登录校验、自动错误处理）
 *   - loginApi:      登录接口（单独起始 url）
 *   - upFileApi:     文件上传接口（无超时限制）
 *   - downloadApi:   文件下载接口（1小时超时）
 *   - searchApi:     文件检索接口（1小时超时）
 *   - apiActivation: 系统激活接口（单独拦截逻辑）
 *   - ganttApi:      甘特图接口（不带 credentials）
 */
import axios from 'axios';
import { ElMessage, ElNotification } from "element-plus";
import router from "@/router/index.js";

// ==================== 统一错误提示工具 ====================
// 防重复弹窗标记位：并发请求同时触发 401 时只弹一次、只跳转一次
let isAuthRedirecting = false;

/** 会话过期 / 未登录：温和提示 + 跳登录页（自带节流） */
const showAuthExpired = (msg) => {
    //需要登录清空登录信息
    if (msg === "需要登录"){
        localStorage.removeItem('pzh_user');
        msg = "登录已过期，请重新登录";
    }
    if (isAuthRedirecting) return;
    isAuthRedirecting = true;
    ElMessage({
        type: 'warning',
        message: msg || '登录已过期，请重新登录',
        showClose: true,
        grouping: true,
        duration: 2500,
    });
    // 给用户一眼看到提示的时间，再跳转
    setTimeout(() => {
        isAuthRedirecting = false;
        router.push('/');
    }, 600);
};

/** 无权访问：右上角 Notification 更醒目，不跳转 */
const showForbidden = (msg) => {
    ElNotification({
        title: '权限不足',
        message: msg || '您没有权限访问该资源，请联系管理员分配相应角色',
        type: 'error',
        duration: 4000,
        position: 'top-right',
    });
};

/** 通用错误提示：可关闭 + 合并重复内容 */
const showError = (msg) => {
    ElMessage({
        type: 'error',
        message: msg || '操作失败',
        showClose: true,
        grouping: true,
        duration: 3500,
    });
};

// 全局启用 Cookie 携带（用于 Session 认证）
axios.defaults.withCredentials = true;

// 创建 后端 API 地址
// 读取配置文件参数
/*const response = await fetch('/config.json');
const config = await response.json();
const serviceBaseURL = await config.api.baseURL//'http://172.17.254.100:8092';*/

// 生产环境
// const serviceBaseURL = 'http://10.195.39.169:8092'; // 固定写法
// const serviceBaseURL = window.location.origin; // 自动获取当前协议+域名+端口(适用于前端合并到后端部署)
 const serviceBaseURL = window.location.protocol + "//" + window.location.hostname + ":8092"; // 自动获取当前协议+域名(端口固定，适用于前端合并到后端部署)

// 开发环境（本地开发时切换）
// const serviceBaseURL = 'http://172.17.254.88:8092';

// ==================== Axios 实例创建 ====================

// 普通业务接口：带登录校验、自动错误提示、GET 请求加时间戳防缓存
const api = axios.create({
    baseURL: serviceBaseURL + '/api', // 后端 API 基础路径
    timeout: 10000,                   // 请求超时时间 10 秒
    withCredentials: true,            // 携带 Cookieï¼Session 认证）
});

// 文件检索接口：超时时间设为 1 小时，适用于大文件搜索查询
const searchApi = axios.create({
    baseURL: serviceBaseURL + '/api',
    timeout: 60 * 60 * 1000,
});

// 登录实例：baseURL 不带 /api 前缀，直接请求 /api/auth/login
const loginApi = axios.create({
    baseURL: serviceBaseURL,
    timeout: 10000,
    withCredentials: true,
});

// 系统激活接口：用于授权码验证，有单独的错误拦截处理逻辑
const apiActivation = axios.create({
    baseURL: serviceBaseURL + '/api',
    timeout: 10000,
});

// 文件上传实例：无固定超时限制，避免大文件上传中断
const upFileApi = axios.create({
    baseURL: serviceBaseURL + '/api',
    // timeout: 60 * 60 * 1000, // 如需可解注开启 1 小时超时
});

// 文件下载实例：长超时，适用于大文件下载
const downloadApi = axios.create({
    baseURL: serviceBaseURL + '/api',
    timeout: 60 * 60 * 1000,
});

// 甘特图实例：不携带 credentials，避免 CORS 预检请求失败
const ganttApi = axios.create({
    baseURL: serviceBaseURL + '/api',
    timeout: 30000,
    withCredentials: false,
});

// 甘特图API响应拦截器
ganttApi.interceptors.response.use(
    (response) => {
        // 返回 response.data，与其他 api 实例保持一致
        return response.data;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// ==================== 常用接口拦截器配置 ====================

// 常用的配置请求拦截器
api.interceptors.request.use(
    (config) => {
        // 可以在这里添加请求头，例如 Token
        // 添加时间戳防止浏览器缓存 GET 请求，解决修改后需要手动刷新才能看到新数据的问题
        if (config.method === 'get') {
            config.params = { ...config.params, _t: Date.now() };
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// 常用的配置响应拦截器
api.interceptors.response.use(
    (response) => {
        const res = response.data;
        // 如果后端有统一封装 Result(code, message, data)
        if (res && res.code !== undefined) {
            if (res.code === 200) {
                return res.data;
            } else if (res.code === 401 || res.code === -1) {
                // 业务层返回需要登录（例如某些接口自返 code=-1）
                showAuthExpired(res.message);
                return Promise.reject(new Error(res.message || '需要登录'));
            } else if (res.code === -2) {
                showError(res.message || '系统未激活或激活已过期');
                router.push('/Activation');
                return Promise.reject(new Error(res.message || '系统未激活或激活已过期'));
            } else {
                showError(res.message);
                return Promise.reject(new Error(res.message || '操作失败'));
            }
        }
        // 无统一包装，直接返回原始数据
        return res;
    },
    (error) => {
        // 根据 HTTP 状态码做精细化提示，后端 MyAuthenticationEntryPoint / MyAccessDeniedHandler 分别返回 401 / 403
        const status = error.response?.status;
        const message = error.response?.data?.message;
        if (status === 401) {
            showAuthExpired(message);
        } else if (status === 403) {
            showForbidden(message);
        } else {
            showError(message || '网络或服务器异常');
        }
        return Promise.reject(error);
    }
);

// ==================== 授权接口拦截器配置 ====================

// 授权的配置响应拦截器
apiActivation.interceptors.response.use(
    (response) => {
        // 对响应数据进行处理
        if (response.data.code === -1) {
            if (response.data.message === '需要登录') {
                ElMessage.error(response.data.message);
                router.push('/');
            } else {
                ElMessage.error(response.data.message);
            }
        }
        return response.data;
    },
    (error) => {
        // 对响应错误进行处理
        return Promise.reject(error);
    }
);

// ==================== 上传文件接口拦截器配置 ====================

// 上传文件的配置请求拦截器
upFileApi.interceptors.request.use(
    (config) => {
        // 可以在这里添加请求头，例如 Token
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// 上传文件的配置响应拦截器
upFileApi.interceptors.response.use(
    (response) => {
        // 对响应数据进行处理
        if (response.data.code === -1) {
            if (response.data.message === '需要登录') {
                ElMessage.error(response.data.message);
                router.push('/');
            } else {
                ElMessage.error(response.data.message);
            }
        }
        return response.data;
    },
    (error) => {
        // 对响应错误进行处理
        return Promise.reject(error);
    }
);

// ==================== 下载文件接口拦截器配置 ====================

// 下载文件的配置响应拦截器
downloadApi.interceptors.response.use(
    (response) => {
        // 下载接口直接返回原始响应，不做处理
        return response;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// ==================== 检索文件接口拦截器配置 ====================

// 检索文件接口请求拦截器
searchApi.interceptors.request.use(
    (config) => {
        // 可以在这里添加请求头，例如 Token
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// 检索文件接口响应拦截器
searchApi.interceptors.response.use(
    (response) => {
        // 对响应数据进行处理
        if (response.data.code === -1) {
            if (response.data.message === '需要登录') {
                ElMessage.error(response.data.message);
                // router.push('/')
            } else {
                ElMessage.error(response.data.message);
            }
        }
        return response.data;
    },
    (error) => {
        // 对响应错误进行处理
        return Promise.reject(error);
    }
);

export default api;
export { loginApi, serviceBaseURL, searchApi, upFileApi, apiActivation, downloadApi, ganttApi };
